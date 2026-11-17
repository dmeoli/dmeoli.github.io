// Packing puzzles solved by a MIP (solve.py, offline: data.js), as a tray and
// its pieces to print: the twelve pentominoes in the rectangles 6 x 10 and
// 3 x 20 and in the square 8 x 8 with a hole in the middle (Dana Scott,
// 1958), and the seven pieces of Piet Hein's Soma cube in a box 3 x 3 x 3.
// Pieces and tray are stacks of axis-parallel columns, built exactly (no
// sampling); the clearance is taken half from every piece and half from the
// tray. No DOM: solid() runs in a worker.

import D from './data.js';
import { merge } from '../../print/index.js';

export const puzzles = {
  pent6x10: { en: 'Pentominoes in 6 x 10', it: 'Pentamini in 6 x 10' },
  pent3x20: { en: 'Pentominoes in 3 x 20', it: 'Pentamini in 3 x 20' },
  scott: { en: 'Pentominoes in 8 x 8 with a hole (Scott)', it: 'Pentamini in 8 x 8 con un foro (Scott)' },
  soma: { en: 'Soma cube, 3 x 3 x 3', it: 'Cubo Soma, 3 x 3 x 3' },
};
export const data = D;

/* ----------------------------------------------- columns on a grid -- */

// A closed solid made of columns standing on z = 0: the grid lines xs (nx + 1
// numbers) and ys, the height of every cell hg[j * nx + i] (0: no column).
// Every vertical edge is cut at every height that occurs, so that the walls
// meet without T-junctions; neighbours touching only at a corner are not
// allowed (they would pinch the surface).
export function columns(xs, ys, hg) {
  const nx = xs.length - 1, ny = ys.length - 1;
  const lv = [...new Set([0, ...hg])].sort((a, b) => a - b), L = lv.length;
  const pos = [], idx = [], ids = new Map();
  const v = (i, j, k) => {
    const key = (j * (nx + 1) + i) * L + k;
    let id = ids.get(key);
    if (id === undefined) { id = pos.length / 3; ids.set(key, id); pos.push(xs[i], ys[j], lv[k]); }
    return id;
  };
  const H = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : hg[j * nx + i]);
  const K = h => lv.indexOf(h);
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const h = H(i, j);
    if (!h) continue;
    const k = K(h);
    quad(v(i, j, k), v(i + 1, j, k), v(i + 1, j + 1, k), v(i, j + 1, k));
    quad(v(i, j, 0), v(i, j + 1, 0), v(i + 1, j + 1, 0), v(i + 1, j, 0));
  }
  // walls on the lines x = xs[i], between the cells i - 1 and i
  for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) {
    const a = H(i - 1, j), b = H(i, j);
    if (a === b) continue;
    const lo = K(Math.min(a, b)), hi = K(Math.max(a, b));
    for (let k = lo; k < hi; k++) {
      if (a > b) quad(v(i, j, k), v(i, j + 1, k), v(i, j + 1, k + 1), v(i, j, k + 1));        // facing +x
      else quad(v(i, j + 1, k), v(i, j, k), v(i, j, k + 1), v(i, j + 1, k + 1));              // facing -x
    }
  }
  // walls on the lines y = ys[j], between the cells j - 1 and j
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
    const a = H(i, j - 1), b = H(i, j);
    if (a === b) continue;
    const lo = K(Math.min(a, b)), hi = K(Math.max(a, b));
    for (let k = lo; k < hi; k++) {
      if (a > b) quad(v(i + 1, j, k), v(i, j, k), v(i, j, k + 1), v(i + 1, j, k + 1));        // facing +y
      else quad(v(i, j, k), v(i + 1, j, k), v(i + 1, j, k + 1), v(i, j, k + 1));              // facing -y
    }
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

// the grid lines of cells of side s, doubled at +-c/2 around every line k s
const lines = (n, s, c, pad = 0) => {
  const out = pad ? [-c / 2 - pad] : [];
  for (let k = 0; k <= n; k++) out.push(k * s - c / 2, k * s + c / 2);
  if (pad) out.push(n * s + c / 2 + pad);
  return out;
};

// a piece: its columns (x, y) -> number of cubes, eroded by c/2 on every
// side and lowered by c at the top; s the side of a cell
export function piece(cells, s, c, unit) {
  const col = new Map();
  let W = 0, Hn = 0;
  for (const [x, y, z] of cells) { const k = x + ',' + y; col.set(k, Math.max(col.get(k) || 0, z + 1)); W = Math.max(W, x + 1); Hn = Math.max(Hn, y + 1); }
  const at = (x, y) => { const i = Math.floor(x / s), j = Math.floor(y / s); return col.get(i + ',' + j) || 0; };
  const xs = lines(W, s, c), ys = lines(Hn, s, c), e = 1e-6;
  const hg = [];
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    // the cell grown by c/2 must lie where the columns are: the lowest of the
    // columns under its corners
    const x0 = xs[i] - c / 2 + e, x1 = xs[i + 1] + c / 2 - e, y0 = ys[j] - c / 2 + e, y1 = ys[j + 1] + c / 2 - e;
    const n = Math.min(at(x0, y0), at(x1, y0), at(x0, y1), at(x1, y1));
    hg.push(n ? n * unit - c : 0);
  }
  const m = columns(xs, ys, hg);
  for (let k = 0; k < m.pos.length; k += 3) { m.pos[k] += c / 2; m.pos[k + 1] += c / 2; }
  return m;
}

// the tray: a block with a pocket where the board is, grown by c/2, its floor
// `floor` thick and its rim `wall` wide, `depth` deep
export function tray(boardCells, w, h, s, c, wall, floor, depth) {
  const on = new Set(boardCells.filter(q => q[2] === 0).map(q => q[0] + ',' + q[1]));
  const xs = lines(w, s, c, wall), ys = lines(h, s, c, wall), hg = [];
  const inBoard = (x, y) => on.has(Math.floor(x / s) + ',' + Math.floor(y / s));
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    // in the pocket when the centre is within c/2 of the board
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2, d = c / 2 + 1e-6;
    const pocket = [[0, 0], [-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, -d], [-d, d], [d, d]].some(([a, b]) => inBoard(cx + a, cy + b));
    hg.push(pocket ? floor : floor + depth);
  }
  const m = columns(xs, ys, hg);
  for (let k = 0; k < m.pos.length; k += 3) { m.pos[k] += c / 2 + wall; m.pos[k + 1] += c / 2 + wall; }
  return m;
}

// sizes in mm from the size of the tray (its longest side)
export function dimsOf(puzzle, size, { clear = 0.25, wall = 2.4 } = {}) {
  const P = D[puzzle], n = Math.max(P.w, P.h), s = (size - 2 * wall - clear) / n;
  const cube = P.d > 1, unit = cube ? s : Math.max(4, Math.min(7, 0.6 * s));
  return { P, s, cube, unit, clear, wall, floor: 2, depth: cube ? 2 * s : unit - 1 };
}

// every piece where the MIP put it (for the view): its cells, shape, place
export const solution = puzzle => D[puzzle].solution;

// o: { puzzle, size (mm, the longest side of the tray), clear (mm, the gap
// between neighbours), pieces (boolean: the pieces too, laid out beside the
// tray), tray (boolean) }
export function solid(o = {}, progress) {
  const { puzzle = 'pent6x10', size = 90, clear = 0.25, pieces = true, tray: withTray = true } = o;
  const g = dimsOf(puzzle, size, { clear }), { P, s, unit } = g;
  const parts = [];
  const T = tray(P.tray, P.w, P.h, s, clear, g.wall, g.floor, g.depth);
  const tw = P.w * s + clear + 2 * g.wall;
  if (withTray) parts.push(T);
  if (pieces) {
    // the pieces in rows under the tray, 4 mm apart
    const shapes = D.shapes[g.cube ? 'soma' : 'pent'], gap = 4, rowW = Math.max(tw, (g.cube ? 3 : 5) * s);
    let x = 0, y = withTray ? -gap : 0, rowH = 0, k = 0;
    for (const [name, cells] of Object.entries(shapes)) {
      const m = piece(cells, s, clear, unit);
      const W = Math.max(...cells.map(q => q[0])) + 1, Hn = Math.max(...cells.map(q => q[1])) + 1;
      const pw = W * s, ph = Hn * s;
      if (x > 0 && x + pw > rowW) { x = 0; y -= rowH + gap; rowH = 0; }
      for (let q = 0; q < m.pos.length; q += 3) { m.pos[q] += x; m.pos[q + 1] += y - ph; }
      parts.push(m);
      x += pw + gap; rowH = Math.max(rowH, ph);
      if (progress) progress(++k / Object.keys(shapes).length);
    }
  }
  const m = merge(...parts);
  m.cell = +s.toFixed(2); m.parts = parts.length;
  // the whole layout centred on the origin
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let q = 0; q < m.pos.length; q += 3) { x0 = Math.min(x0, m.pos[q]); x1 = Math.max(x1, m.pos[q]); y0 = Math.min(y0, m.pos[q + 1]); y1 = Math.max(y1, m.pos[q + 1]); }
  for (let q = 0; q < m.pos.length; q += 3) { m.pos[q] -= (x0 + x1) / 2; m.pos[q + 1] -= (y0 + y1) / 2; }
  return m;
}

export const fileName = o => `packing_${o.puzzle || 'pent6x10'}_${o.size}mm_c${o.clear}${o.pieces === false ? '_tray' : ''}${o.tray === false ? '_pieces' : ''}`;

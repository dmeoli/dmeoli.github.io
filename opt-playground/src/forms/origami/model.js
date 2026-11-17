// Origami and kirigami that move: the Miura-ori, a quadrilateral mesh whose
// parallelogram panels stay rigid while it folds, and the rotating squares,
// a kirigami of squares joined at alternate corners. The folded shapes
// follow from closed formulas (miuraFolded, squaresAt); the prints are flat
// sheets: rigid panels with chamfered edges joined by a thin film in the
// middle of their thickness (miuraSolid), or squares joined by narrow necks
// (squaresSolid), so that the printed sheet folds or opens by hand.

import { Layers } from '../../print/index.js';

const D2R = Math.PI / 180;

/* -------------------------------------------------------- the Miura-ori -- */

// the flat crease pattern: vertices V[i][j], i = 0..m along the zigzags
// (each step of length b at angle alpha from the straight creases), j = 0..n
// along the straight creases (steps of length a)
export function miuraFlat({ m = 6, n = 6, alpha = 70, a = 1, b = 1 } = {}) {
  const s = Math.sin(alpha * D2R), c = Math.cos(alpha * D2R);
  return Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => [i * b * s, j * a + (i % 2 ? b * c : 0), 0]));
}

// the folded state at f in [0, 1] (0 flat, 1 flat-folded): the straight
// creases become zigzags of height H = f a sin(alpha) in the y-z plane, the
// zigzags stay in horizontal planes; with L^2 + H^2 = a^2, V L = a b cos(alpha)
// (the angle alpha of every panel is kept) and S^2 + V^2 = b^2, vertex (i, j)
// is (i S, j L + V [i odd], H [j odd]), and every panel stays a parallelogram
// with sides a and b (Schenk and Guest 2013 give the same in other variables)
export function miuraFolded({ m = 6, n = 6, alpha = 70, a = 1, b = 1 } = {}, f = 0) {
  const H = Math.min(f, 0.999) * a * Math.sin(alpha * D2R), L = Math.sqrt(a * a - H * H);
  const V = a * b * Math.cos(alpha * D2R) / L, S = Math.sqrt(Math.max(0, b * b - V * V));
  return Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => [i * S, j * L + (i % 2 ? V : 0), j % 2 ? H : 0]));
}

// the point at distance d inside both sides of the corner q, whose sides go
// towards p1 and p2
function inset(q, p1, p2, d) {
  const u = [p1[0] - q[0], p1[1] - q[1]], v = [p2[0] - q[0], p2[1] - q[1]];
  const lu = Math.hypot(...u), lv = Math.hypot(...v);
  const uh = [u[0] / lu, u[1] / lu], vh = [v[0] / lv, v[1] / lv];
  const sn = Math.abs(uh[0] * vh[1] - uh[1] * vh[0]) || 1;
  return [q[0] + d / sn * (uh[0] + vh[0]), q[1] + d / sn * (uh[1] + vh[1])];
}

// the printed sheet, flat on the bed. Every panel is a slab of thickness
// `thick` whose sides slope inwards from the film to its faces, so that two
// neighbours can turn by `limit` degrees either way before their faces meet;
// at the film the panels are `gap` apart, and the film (thickness `film`) in
// the middle of the slab joins them all. Points of the film are the corners
// of the panels set in by gap / 2: a grid of 2m x 2n points whose cells are
// the panels, the strips along the creases and the small cells at the
// vertices.
export function miuraSolid(o = {}) {
  const { m = 6, n = 6, alpha = 70, ratio = 1, size = 120, thick = 2, film = 0.4, gap = 0.8, limit = 120 } = o;
  const F0 = miuraFlat({ m, n, alpha, a: ratio, b: 1 });
  const W = F0[m][n][0], Hy = Math.max(...F0.map(col => col[n][1]));
  const k = size / Math.max(W, Hy), F = F0.map(col => col.map(([x, y]) => [x * k, y * k]));
  // the slope of the sides, kept within a third of the width of a panel
  const hz = (thick - film) / 2, room = Math.max(0.05, Math.min(ratio, 1) * k * Math.sin(alpha * D2R) / 3 - gap / 2);
  const ch = Math.min(hz * Math.tan(limit / 2 * D2R), room), zb = hz, zt = hz + film;
  const NI = 2 * m, NJ = 2 * n, film2 = [], face2 = [];
  for (let I = 0; I < NI; I++) for (let J = 0; J < NJ; J++) {
    const i = I >> 1, j = J >> 1, di = I & 1, dj = J & 1;
    const q = F[i + di][j + dj], p1 = F[i + 1 - di][j + dj], p2 = F[i + di][j + 1 - dj];
    film2[I * NJ + J] = inset(q, p1, p2, gap / 2);
    face2[I * NJ + J] = inset(q, p1, p2, gap / 2 + ch);
  }
  const pos = [], idx = [];
  const add = (p, z) => { pos.push(p[0], p[1], z); return pos.length / 3 - 1; };
  const fb = [], ft = [], pb = [], pt = [];
  for (let g = 0; g < NI * NJ; g++) { fb[g] = add(film2[g], zb); ft[g] = add(film2[g], zt); pb[g] = add(face2[g], 0); pt[g] = add(face2[g], thick); }
  const G = (I, J) => I * NJ + J;
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  for (let I = 0; I + 1 < NI; I++) for (let J = 0; J + 1 < NJ; J++) {
    const c = [G(I, J), G(I + 1, J), G(I + 1, J + 1), G(I, J + 1)];
    if (I % 2 === 0 && J % 2 === 0) {
      // a panel: faces and the sloping sides from the film to them
      quad(pt[c[0]], pt[c[1]], pt[c[2]], pt[c[3]]);
      quad(pb[c[3]], pb[c[2]], pb[c[1]], pb[c[0]]);
      for (let e = 0; e < 4; e++) {
        const A = c[e], B = c[(e + 1) % 4];
        quad(ft[A], ft[B], pt[B], pt[A]);
        quad(fb[B], fb[A], pb[A], pb[B]);
      }
    } else {
      // the film between panels, top and bottom
      quad(ft[c[0]], ft[c[1]], ft[c[2]], ft[c[3]]);
      quad(fb[c[3]], fb[c[2]], fb[c[1]], fb[c[0]]);
    }
  }
  // the edge of the film around the sheet, counterclockwise
  const loop = [];
  for (let I = 0; I < NI - 1; I++) loop.push(G(I, 0));
  for (let J = 0; J < NJ - 1; J++) loop.push(G(NI - 1, J));
  for (let I = NI - 1; I > 0; I--) loop.push(G(I, NJ - 1));
  for (let J = NJ - 1; J > 0; J--) loop.push(G(0, J));
  for (let e = 0; e < loop.length; e++) { const A = loop[e], B = loop[(e + 1) % loop.length]; quad(fb[A], fb[B], ft[B], ft[A]); }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), dims: [W * k, Hy * k, thick], panel: +(Math.min(1, ratio) * k).toFixed(1), turn: Math.round(2 * Math.atan(ch / hz) / D2R) };
}

/* ------------------------------------------------- the rotating squares -- */

// square (i, j) turns by -theta when i + j is even and by +theta when odd;
// its neighbours hang on alternate corners, so that the centres sit on a
// square lattice of step s (cos theta + sin theta), from s at theta = 0 to
// s sqrt(2) at 45 degrees (Grima and Evans 2000); returns the four corners
// of every square
export function squaresAt({ m = 6, n = 6 } = {}, theta = 0, s = 1) {
  const th = theta * D2R, L = s * (Math.cos(th) + Math.sin(th)), h = s / 2, out = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
    const phi = (i + j) % 2 ? th : -th, c = Math.cos(phi), sn = Math.sin(phi), cx = i * L, cy = j * L;
    out.push([[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [cx + c * x - sn * y, cy + sn * x + c * y]));
  }
  return out;
}

// which corner joins square (i, j) to each neighbour: right and left
// neighbours at the top or bottom end, upper and lower ones at the left or
// right end, alternating with the parity of i + j
const hingeH = (i, j) => ((i + j) % 2 ? 'bottom' : 'top');
const hingeV = (i, j) => ((i + j) % 2 ? 'right' : 'left');

// the printed sheet: squares of side `side` mm, `cut` mm apart, joined by
// necks `neck` mm wide; one closed slab of thickness `thick`
export function squaresSolid(o = {}) {
  const { m = 6, n = 6, size = 120, cut = 1, neck = 1, thick = 1.6 } = o;
  const side = (size - (Math.max(m, n) - 1) * cut) / Math.max(m, n), p = side + cut, h = side / 2, w = Math.min(neck, side / 3);
  const V = [], ids = new Map(), T = [];
  const vid = (x, y) => {
    const key = x.toFixed(4) + ',' + y.toFixed(4);
    if (!ids.has(key)) { ids.set(key, V.length); V.push([x, y]); }
    return ids.get(key);
  };
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
    const cx = i * p + h, cy = j * p + h;
    // the outline counterclockwise from the lower left corner, with a point
    // on a side wherever a neck leaves it
    const ring = [[cx - h, cy - h]];
    if (j > 0 && hingeV(i, j - 1) === 'left') ring.push([cx - h + w, cy - h]);
    if (j > 0 && hingeV(i, j - 1) === 'right') ring.push([cx + h - w, cy - h]);
    ring.push([cx + h, cy - h]);
    if (i + 1 < m && hingeH(i, j) === 'bottom') ring.push([cx + h, cy - h + w]);
    if (i + 1 < m && hingeH(i, j) === 'top') ring.push([cx + h, cy + h - w]);
    ring.push([cx + h, cy + h]);
    if (j + 1 < n && hingeV(i, j) === 'right') ring.push([cx + h - w, cy + h]);
    if (j + 1 < n && hingeV(i, j) === 'left') ring.push([cx - h + w, cy + h]);
    ring.push([cx - h, cy + h]);
    if (i > 0 && hingeH(i - 1, j) === 'top') ring.push([cx - h, cy + h - w]);
    if (i > 0 && hingeH(i - 1, j) === 'bottom') ring.push([cx - h, cy - h + w]);
    const c = vid(cx, cy), r = ring.map(([x, y]) => vid(x, y));
    for (let k = 0; k < r.length; k++) T.push(c, r[k], r[(k + 1) % r.length]);
    // the necks to the right and above
    if (i + 1 < m) {
      const x0 = cx + h, x1 = cx + h + cut, top = hingeH(i, j) === 'top';
      const y0 = top ? cy + h - w : cy - h, y1 = top ? cy + h : cy - h + w;
      const q = [vid(x0, y0), vid(x1, y0), vid(x1, y1), vid(x0, y1)];
      T.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
    if (j + 1 < n) {
      const y0 = cy + h, y1 = cy + h + cut, left = hingeV(i, j) === 'left';
      const x0 = left ? cx - h : cx + h - w, x1 = left ? cx - h + w : cx + h;
      const q = [vid(x0, y0), vid(x1, y0), vid(x1, y1), vid(x0, y1)];
      T.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
  }
  // walls on the edges that only one triangle runs along
  const dir = new Set();
  for (let k = 0; k < T.length; k += 3) for (let e = 0; e < 3; e++) dir.add(T[k + e] + ',' + T[k + (e + 1) % 3]);
  const L = new Layers(V);
  L.face(T, 0, false); L.face(T, thick, true);
  for (let k = 0; k < T.length; k += 3) for (let e = 0; e < 3; e++) {
    const a = T[k + e], b = T[k + (e + 1) % 3];
    if (dir.has(b + ',' + a)) continue;
    const a0 = L.at(a, 0), b0 = L.at(b, 0), a1 = L.at(a, thick), b1 = L.at(b, thick);
    L.idx.push(a0, b0, b1, a0, b1, a1);
  }
  const mesh = L.mesh();
  mesh.square = +side.toFixed(1);
  return mesh;
}

/* ------------------------------------------------------------ the solid -- */

// o: { pattern ('miura' | 'squares'), m, n, alpha, ratio, size, thick, film,
// gap, limit, cut, neck }
export function solid(o = {}, progress) {
  const mesh = o.pattern === 'squares' ? squaresSolid(o) : miuraSolid(o);
  if (progress) progress(1);
  return mesh;
}

export const fileName = o => (o.pattern === 'squares'
  ? `kirigami_squares_${o.m}x${o.n}_${o.size}mm`
  : `miura_${o.m}x${o.n}_a${o.alpha}_${o.size}mm`);

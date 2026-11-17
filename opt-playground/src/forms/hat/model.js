// The hat and the Spectre (Smith, Myers, Kaplan and Goodman-Strauss, 2023):
// a patch of the tiling built by the substitution of the Spectre paper
// (nine tiles per supertile, the "mystic" Gamma made of two), in exact
// arithmetic on Z[zeta], zeta = exp(i pi / 6), so that the vertices of
// neighbouring tiles coincide exactly. The Tile(a, b) family follows from
// one map: an edge in one of the six directions zeta^(2j) gets length a, one
// in the six directions zeta^(2j+1) gets length b; this map is well defined
// on Z[zeta] = Z[zeta^2] + zeta Z[zeta^2], so the whole tiling of Tile(1, 1)
// becomes a tiling of Tile(a, b) in which the tiles turned by an odd
// multiple of 30 degrees become mirror images. Tile(1, sqrt 3) is the hat,
// Tile(sqrt 3, 1) the turtle, Tile(1, 1) with curved edges the Spectre.
// The substitution follows the reference code of C. S. Kaplan (2023).

import { extrudePolygon, merge, transform, circle, signedArea, Layers, triangulate } from '../../print/index.js';

/* ----------------------------------------- exact points of Z[zeta] -- */

// [c0, c1, c2, c3] = c0 + c1 zeta + c2 zeta^2 + c3 zeta^3
const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3]];
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]];
const zeta = p => [-p[3], p[0], p[1] + p[3], p[2]];
const rot = (p, k) => { k = ((k % 12) + 12) % 12; for (let i = 0; i < k; i++) p = zeta(p); return p; };
// x -> -x
const mirror = p => [-p[0] - p[2], -p[1], p[2], p[1] + p[3]];
const C30 = Math.sqrt(3) / 2;
// the point with edges of the even directions scaled by a, of the odd by b
export const toXY = (p, a = 1, b = 1) => [a * (p[0] + 0.5 * p[2]) + b * C30 * p[1], a * C30 * p[2] + b * (0.5 * p[1] + p[3])];
const dirs = [0, 10, 1, 3, 0, 2, 5, 7, 4, 6, 6, 8, 11, 9];
const unit = k => rot([1, 0, 0, 0], k);
// the 14 vertices of Tile(1, 1), counterclockwise
export const SPECTRE = (() => { const v = [[0, 0, 0, 0]]; for (let i = 0; i < 13; i++) v.push(add(v[i], unit(dirs[i]))); return v; })();

/* ----------------------------------- transforms: p -> rot^k M^f p + t -- */

const I = { k: 0, f: false, t: [0, 0, 0, 0] };
const lin = (T, p) => rot(T.f ? mirror(p) : p, T.k);
const apply = (T, p) => add(lin(T, p), T.t);
const mul = (A, B) => ({ k: (A.k + (A.f ? -B.k : B.k) + 24) % 12, f: A.f !== B.f, t: add(lin(A, B.t), A.t) });
const trot = k => ({ k: ((k % 12) + 12) % 12, f: false, t: [0, 0, 0, 0] });
const ttrans = t => ({ k: 0, f: false, t });
// the translation that takes p to q
const transTo = (p, q) => ttrans(sub(q, p));

/* --------------------------------------------- the substitution -- */

const LABELS = ['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi'];
const RULES = {
  Gamma: ['Pi', 'Delta', null, 'Theta', 'Sigma', 'Xi', 'Phi', 'Gamma'],
  Delta: ['Xi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
  Theta: ['Psi', 'Delta', 'Pi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
  Lambda: ['Psi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
  Xi: ['Psi', 'Delta', 'Pi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
  Pi: ['Psi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
  Sigma: ['Xi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Lambda', 'Gamma'],
  Phi: ['Psi', 'Delta', 'Psi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
  Psi: ['Psi', 'Delta', 'Psi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
};

function base() {
  const sys = {}, quad = [3, 5, 7, 11].map(i => SPECTRE[i]);
  for (const l of LABELS) sys[l] = { leaf: l, quad };
  sys.Gamma = { kids: [[{ leaf: 'Gamma1' }, I], [{ leaf: 'Gamma2' }, mul(ttrans(SPECTRE[8]), trot(1))]], quad };
  return sys;
}

function supertiles(sys) {
  const quad = sys.Delta.quad, R = { k: 0, f: true, t: [0, 0, 0, 0] };
  const rules = [[2, 3, 1], [0, 2, 0], [2, 3, 1], [2, 3, 1], [0, 2, 0], [2, 3, 1], [-4, 3, 3]];
  const Ts = [I];
  let total = 0, r = I, tq = [...quad];
  for (const [ang, from, to] of rules) {
    total += ang;
    if (ang) { r = trot(total); tq = quad.map(q => apply(r, q)); }
    Ts.push(mul(transTo(tq[to], apply(Ts[Ts.length - 1], quad[from])), r));
  }
  const RT = Ts.map(T => mul(R, T));
  const squad = [apply(RT[6], quad[2]), apply(RT[5], quad[1]), apply(RT[3], quad[2]), apply(RT[0], quad[1])];
  const out = {};
  for (const l of LABELS) out[l] = { kids: RULES[l].map((s, i) => s && [sys[s], RT[i]]).filter(Boolean), quad: squad };
  return out;
}

// the tiles of the supertile of the given level: [{ T, label }]
export function patch(level = 3, root = 'Delta') {
  let sys = base();
  for (let i = 0; i < level; i++) sys = supertiles(sys);
  const tiles = [];
  const walk = (node, T) => {
    if (node.leaf) { tiles.push({ T, label: node.leaf }); return; }
    for (const [kid, S] of node.kids) walk(kid, mul(T, S));
  };
  // an odd level is drawn mirrored, so that the tiles of the majority are
  // never mirror images
  walk(sys[root], level % 2 ? { k: 0, f: true, t: [0, 0, 0, 0] } : I);
  return tiles;
}

/* ----------------------------------------- tiles in the plane -- */

// the polygon of each tile for Tile(a, b) (counterclockwise), and whether it
// is a mirror image; curved: the edges of the Spectre, an S on each edge
export function polygons(tiles, a = 1, b = 1, { curve = 0, steps = 8 } = {}) {
  return tiles.map(({ T, label }) => {
    const ex = SPECTRE.map(p => apply(T, p));
    let P = ex.map(p => toXY(p, a, b));
    const mirrored = (T.k % 2 === 1) !== T.f;
    if (signedArea(P) < 0) { P.reverse(); ex.reverse(); }
    if (curve) {
      const Q = [];
      for (let i = 0; i < P.length; i++) {
        const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], dx = x1 - x0, dy = y1 - y0;
        for (let s = 0; s < steps; s++) {
          const u = s / steps, o = curve * Math.sin(2 * Math.PI * u);
          Q.push([x0 + u * dx + o * dy, y0 + u * dy - o * dx]);
        }
      }
      P = Q;
    }
    return { P, mirrored, label, keys: ex.map(p => p.join(',')), T };
  });
}

export const centroid = P => {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], c = x0 * y1 - x1 * y0;
    a += c; x += (x0 + x1) * c; y += (y0 + y1) * c;
  }
  return [x / (3 * a), y / (3 * a)];
};

// the shapes offered: a and b of Tile(a, b), and the S of the Spectre
export const SHAPES = {
  hat: { a: 1, b: Math.sqrt(3), curve: 0 },
  spectre: { a: 1, b: 1, curve: 0.12 },
  tile11: { a: 1, b: 1, curve: 0 },
  turtle: { a: Math.sqrt(3), b: 1, curve: 0 },
};
export const shapeAB = (shape, mix) => {
  if (shape !== 'mix') return SHAPES[shape];
  // mix in [0, 1]: from the hat (0) through Tile(1, 1) (0.5) to the turtle (1)
  const th = Math.PI / 3 - Math.PI / 6 * mix;
  return { a: Math.cos(th), b: Math.sin(th), curve: 0 };
};

/* ---------------------------------------------- the printed set -- */

// the n tiles nearest to the centre of a big patch, with no holes, sorted by
// distance; returns the polygons and the outer boundary of their union
export function puzzle(n, shape) {
  const { a, b, curve } = shape;
  const all = polygons(patch(3), a, b, { curve });
  const cs = all.map(t => centroid(t.P));
  const mx = cs.reduce((s, c) => [s[0] + c[0] / cs.length, s[1] + c[1] / cs.length], [0, 0]);
  const order = cs.map((c, i) => [Math.hypot(c[0] - mx[0], c[1] - mx[1]), i]).sort((u, v) => u[0] - v[0]).map(u => u[1]);
  let pick = new Set(order.slice(0, n));
  const loopsOf = sel => boundary([...sel].map(i => all[i]));
  // fill holes: a tile not picked whose centroid lies inside the outer loop
  for (let it = 0; it < 6; it++) {
    const { loops } = loopsOf(pick);
    if (loops.length <= 1) break;
    const outer = loops[0];
    for (let i = 0; i < all.length; i++) if (!pick.has(i) && inside(cs[i], outer.xy)) pick.add(i);
  }
  const tiles = [...pick].map(i => all[i]);
  const { loops } = boundary(tiles);
  // with curved edges the boundary is the polygon of the curves of its edges
  return { tiles, outline: loops[0].xy, center: mx };

  function boundary(ts) {
    // edges by their exact end points: an edge run by one tile only is on the boundary
    const count = new Map(), seg = [];
    for (const t of ts) {
      const K = t.keys, m = K.length, per = t.P.length / m;
      for (let i = 0; i < m; i++) {
        const u = K[i], v = K[(i + 1) % m], key = u < v ? u + '|' + v : v + '|' + u;
        count.set(key, (count.get(key) || 0) + 1);
        seg.push({ u, v, key, pts: t.P.slice(i * per, (i + 1) * per), end: t.P[((i + 1) * per) % t.P.length] });
      }
    }
    const next = new Map();
    for (const s of seg) if (count.get(s.key) === 1) next.set(s.u, s);
    const loops = [], seen = new Set();
    for (const [u0] of next) {
      if (seen.has(u0)) continue;
      const xy = [];
      let u = u0, guard = 0;
      while (!seen.has(u) && guard++ < 1e5) { seen.add(u); const s = next.get(u); if (!s) break; xy.push(...s.pts); u = s.v; }
      loops.push({ xy, area: Math.abs(signedArea(xy)) });
    }
    loops.sort((p, q) => q.area - p.area);
    return { loops };
  }
}

export function inside([x, y], P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// the polygon without the corners that lie on a straight side (the hat has
// one in the middle of its long edge) and without repeated points
export function simplify(P, tol = 1e-6) {
  let Q = P;
  for (let pass = 0; pass < 4; pass++) {
    const out = [];
    for (let i = 0; i < Q.length; i++) {
      const a = out.length ? out[out.length - 1] : Q[(i + Q.length - 1) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < tol) continue;
      const dist = l > 0 ? Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / l : 0;
      // a corner on the segment from a to c (not a spike going back)
      const ahead = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0;
      if (dist < tol && ahead) continue;
      out.push(b);
    }
    if (out.length === Q.length) break;
    Q = out;
  }
  return Q;
}

// a polygon moved inwards by d (counterclockwise polygon, small d)
export function inset(P, d) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = P[(i + n - 1) % n], q = P[i], r = P[(i + 1) % n];
    const l1 = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, l2 = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1;
    const n1 = [-(q[1] - p[1]) / l1, (q[0] - p[0]) / l1], n2 = [-(r[1] - q[1]) / l2, (r[0] - q[0]) / l2];
    const c = 1 + n1[0] * n2[0] + n1[1] * n2[1], s = c < 0.2 ? 0.2 : c;
    out.push([q[0] + d * (n1[0] + n2[0]) / s, q[1] + d * (n1[1] + n2[1]) / s]);
  }
  return out;
}

// the triangles of a polygon with one hole (outer counterclockwise, hole
// clockwise; indices into outer followed by hole): the hole is joined to the
// outer boundary by a bridge, and the polygon so made is cut by ear clipping
export function triangulateRing(outer, hole) {
  const V = [...outer, ...hole], no = outer.length;
  const crossSeg = (p, q, a, b) => {
    const d = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    return d(p, q, a) * d(p, q, b) < 0 && d(a, b, p) * d(a, b, q) < 0;
  };
  // the rightmost vertex of the hole, and the nearest outer vertex it sees
  let hi = 0;
  hole.forEach((p, i) => { if (p[0] > hole[hi][0]) hi = i; });
  const hp = hole[hi], edges = [...outer.map((p, i) => [p, outer[(i + 1) % no]]), ...hole.map((p, i) => [p, hole[(i + 1) % hole.length]])];
  const cand = outer.map((p, i) => [Math.hypot(p[0] - hp[0], p[1] - hp[1]), i]).sort((u, v) => u[0] - v[0]);
  let oi = cand[0][1];
  for (const [, i] of cand) if (!edges.some(([a, b]) => crossSeg(hp, outer[i], a, b))) { oi = i; break; }
  const ring = [];
  for (let k = 0; k <= no; k++) ring.push((oi + k) % no);
  for (let k = 0; k <= hole.length; k++) ring.push(no + (hi + k) % hole.length);
  // ear clipping; points equal to a corner of the ear do not block it
  const idx = [...ring], T = [];
  const P = i => V[i], cr = (a, b, c) => (P(b)[0] - P(a)[0]) * (P(c)[1] - P(a)[1]) - (P(b)[1] - P(a)[1]) * (P(c)[0] - P(a)[0]);
  const same = (i, j) => P(i)[0] === P(j)[0] && P(i)[1] === P(j)[1];
  let guard = 0;
  while (idx.length > 3 && guard++ < 1e6) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cr(a, b, c) <= 1e-12) continue;
      let ok = true;
      for (const q of idx) {
        if (q === a || q === b || q === c || same(q, a) || same(q, b) || same(q, c)) continue;
        if (cr(a, b, q) >= 0 && cr(b, c, q) >= 0 && cr(c, a, q) >= 0) { ok = false; break; }
      }
      if (!ok) continue;
      T.push(a, b, c); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) throw new Error('triangulateRing: no ear');
  }
  if (cr(idx[0], idx[1], idx[2]) > 0) T.push(idx[0], idx[1], idx[2]);
  return { V, T };
}

const roundRect = (W, H, r, n = 8) => {
  const P = [];
  for (const [cx, cy, a0] of [[W / 2 - r, -H / 2 + r, -90], [W / 2 - r, H / 2 - r, 0], [-W / 2 + r, H / 2 - r, 90], [-W / 2 + r, -H / 2 + r, 180]])
    for (let j = 0; j <= n; j++) { const a = (a0 + 90 * j / n) * Math.PI / 180; P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return P;
};

// the pieces of the puzzle, in mm: the tray (a plate with a pocket shaped
// as the patch, one gap wider than it) and the tiles where they lie in it,
// each with the dot that marks a mirror image
// o: { shape, mix, count, size (mm across the tray), thick (tile, mm),
// gap (mm between a tile and the next) }
export function pieces(o = {}) {
  // a patch whose outline touches itself cannot be cut into triangles: one
  // tile more, then
  let err;
  for (let extra = 0; extra < 12; extra++) {
    try { return piecesOf({ ...o, count: (o.count || 24) + extra }); } catch (e) { err = e; }
  }
  throw err;
}

function piecesOf(o) {
  const { shape = 'hat', mix = 0.5, count = 24, size = 150, thick = 3, gap = 0.3 } = o;
  const { tiles, outline } = puzzle(count, shapeAB(shape, mix));
  // scale: the outline plus the rim of the tray spans `size`
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const [x, y] of outline) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }
  const rim = 6, k = (size - 2 * rim) / Math.max(mxx - mnx, mxy - mny);
  const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
  const S = ([x, y]) => [(x - cx) * k, (y - cy) * k];
  const floor = 1.6, top = floor + Math.max(0.8, thick - 0.8);
  const W = (mxx - mnx) * k + 2 * rim, H = (mxy - mny) * k + 2 * rim;
  const outer = roundRect(W, H, 4);
  const pocket = inset(simplify(outline.map(S), 1e-6), -gap / 2), hole = [...pocket].reverse();
  const { V, T } = triangulateRing(outer, hole);
  const L = new Layers(V), no = outer.length, hl = hole.map((_, i) => no + i);
  L.face(triangulate(outer), 0, false);
  L.wall([...outer.keys()], 0, top);
  L.face(T, top, true);
  L.wall(hl, floor, top);
  L.face(triangulate(pocket).map(i => no + hole.length - 1 - i), floor, true);
  const r = Math.min(2.2, 0.08 * size / Math.sqrt(count));
  const out = tiles.map(t => {
    const P = inset(simplify(t.P.map(S), 1e-6), gap / 2), m = extrudePolygon(P, thick);
    let dot = null;
    if (t.mirrored) {
      // on the face that is up when the tile lies as in the tiling, sunk 0.2 mm
      const [qx, qy] = centroid(P);
      dot = transform(extrudePolygon(circle(r, 20), 0.8), ([x, y, z]) => [x + qx, y + qy, z + thick - 0.2]);
    }
    return { m, dot, mirrored: t.mirrored };
  });
  return { tray: L.mesh(), tiles: out, W, H, floor, top };
}

// o as for pieces, and what: 'both' | 'tiles' | 'tray'; with both, the
// tiles lie beside the tray, so that one plate prints everything
export function solid(o = {}, progress) {
  const what = o.what || 'both', P = pieces(o), parts = [];
  if (progress) progress(0.5);
  if (what !== 'tiles') parts.push(P.tray);
  if (what !== 'tray') {
    const dx = what === 'both' ? P.W + 8 : 0;
    for (const t of P.tiles) for (const m of [t.m, t.dot]) if (m) parts.push(transform(m, ([x, y, z]) => [x + dx, y, z]));
  }
  if (progress) progress(1);
  const m = merge(...parts);
  m.tiles = P.tiles.length; m.mirrored = P.tiles.filter(t => t.mirrored).length;
  return m;
}

export const fileName = o => `${o.shape === 'mix' ? 'tile_ab' : o.shape}_${o.count}_tiles_${o.what}_${o.size}mm`;

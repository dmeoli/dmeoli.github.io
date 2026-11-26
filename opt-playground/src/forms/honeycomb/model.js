// The honeycomb: the geometry behind the bees' comb. A patch of cells on the
// triangular lattice, their Voronoi diagram (which is the regular hexagonal
// tiling), the relaxation of packed circles into hexagons that minimizes the
// wall length at fixed area, the comparison of the three regular tilings by
// wall per unit area, and the three-dimensional cell with the rhombic base,
// built as a closed solid for the print. No name of a painter here, only the
// mathematics; cf. Hales (2001) for the honeycomb conjecture and Fejes Toth
// (1964) for the slightly more economical closure of the cell.

export const KEYS = ['shape', 'cells', 'relax', 'show', 'cell3d'];

export function defaults() {
  return { shape: 'hex', cells: 61, relax: 1, show: 'comb', cell3d: 'bee' };
}

export const presets = {
  comb: { en: 'the comb', it: 'il favo', shape: 'hex', cells: 61, relax: 1, show: 'comb', cell3d: 'bee' },
  relaxing: { en: 'circles into hexagons', it: 'cerchi in esagoni', shape: 'hex', cells: 61, relax: 0.45, show: 'relax', cell3d: 'bee' },
  voronoi: { en: 'Voronoi of the lattice', it: 'Voronoi del reticolo', shape: 'hex', cells: 61, relax: 1, show: 'voronoi', cell3d: 'bee' },
  square: { en: 'the square comb', it: 'il favo quadrato', shape: 'square', cells: 49, relax: 1, show: 'comb', cell3d: 'bee' },
};

export function fileName(o) {
  const s = o.show === 'cell' ? 'cell' : 'comb';
  return `honeycomb-${s}-${o.cells}`;
}

/* -------------------------------------------------------- the lattice ---- */

// Centers of the cells. For 'hex' the triangular lattice, whose Voronoi diagram
// is the regular hexagonal tiling; for 'square' the integer lattice, whose
// Voronoi diagram is the square tiling. One extra ring of seeds is added as a
// guard, so that every drawn cell is bounded on all sides; `draw` lists the
// indices of the seeds whose cell is drawn (the interior, guard excluded). The
// count asked for is rounded to a full set of rings.
export function centers(shape, n) {
  const pts = [], draw = [];
  if (shape === 'square') {
    const r = Math.max(1, Math.round((Math.sqrt(n) - 1) / 2));
    for (let i = -r - 1; i <= r + 1; i++) for (let j = -r - 1; j <= r + 1; j++) {
      pts.push([i, j]);
      if (Math.max(Math.abs(i), Math.abs(j)) <= r) draw.push(pts.length - 1);
    }
    return { pts, draw, pitch: 1, shape };
  }
  // 'hex': triangular lattice of seeds -> hexagonal Voronoi cells
  const r = ringsFor(n);
  const ringOf = [];
  pts.push([0, 0]); ringOf.push(0);
  const steps = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
  for (let k = 1; k <= r + 1; k++) {            // one guard ring beyond r
    let a = k, b = 0;
    for (const [da, db] of steps)
      for (let i = 0; i < k; i++) { pts.push(axial(a, b)); ringOf.push(k); a += da; b += db; }
  }
  pts.forEach((p, i) => { if (ringOf[i] <= r) draw.push(i); });
  return { pts, draw, pitch: 1, shape };
}

function ringsFor(n) { let r = 0; while (3 * r * (r + 1) + 1 < n) r++; return r; }

// axial (q,r) -> Cartesian, flat-top hexagons, unit nearest-neighbor distance
function axial(q, r) { return [q + r / 2, r * Math.sqrt(3) / 2]; }

/* --------------------------------------------------- Voronoi of seeds ---- */

// Clipped Voronoi cell of each seed, by half-plane clipping against the others
// within a neighborhood. Exact enough for a lattice, and it is the figure the
// scene draws; returns, for each seed, its polygon (array of [x,y]).
export function voronoi(pts, pitch) {
  const big = 40 * pitch;
  return pts.map((p, i) => {
    let poly = [[-big, -big], [big, -big], [big, big], [-big, big]];
    for (let j = 0; j < pts.length; j++) {
      if (j === i) continue;
      const dx = pts[j][0] - p[0], dy = pts[j][1] - p[1];
      const d2 = dx * dx + dy * dy;
      if (d2 > 9 * pitch * pitch) continue;           // only near seeds matter
      // half-plane: points closer to p than to pts[j]
      const mx = (p[0] + pts[j][0]) / 2, my = (p[1] + pts[j][1]) / 2;
      poly = clip(poly, dx, dy, dx * mx + dy * my);
      if (poly.length === 0) break;
    }
    return poly;
  });
}

// keep the part of the polygon with a*x + b*y <= c
function clip(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const da = a * A[0] + b * A[1] - c, db = a * B[0] + b * B[1] - c;
    if (da <= 0) out.push(A);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
    }
  }
  return out;
}

/* -------------------------------------- circles relaxing to hexagons ---- */

// The cell as it grows: at relax = 0 the inscribed circle of the Voronoi cell,
// at relax = 1 the Voronoi polygon itself. In between, a blend that stands for
// soft disks pressed together until the walls are shared and straight, the step
// that takes the least-perimeter partition (Hales 2001) from circles, which
// leave gaps, to the hexagon, which does not.
export function relaxed(poly, center, t) {
  if (t >= 1) return poly;
  const r = inradius(poly, center);
  const circle = [];
  const m = 48;
  for (let k = 0; k < m; k++) {
    const a = 2 * Math.PI * k / m;
    circle.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]);
  }
  if (t <= 0) return circle;
  // sample both outlines by angle and blend
  const out = [];
  for (let k = 0; k < m; k++) {
    const a = 2 * Math.PI * k / m;
    const pc = [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)];
    const ph = rayHit(poly, center, a);
    out.push([pc[0] + t * (ph[0] - pc[0]), pc[1] + t * (ph[1] - pc[1])]);
  }
  return out;
}

function inradius(poly, c) {
  let r = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const ex = B[0] - A[0], ey = B[1] - A[1], L = Math.hypot(ex, ey) || 1;
    const nx = ey / L, ny = -ex / L;
    const d = Math.abs(nx * (c[0] - A[0]) + ny * (c[1] - A[1]));
    r = Math.min(r, d);
  }
  return r === Infinity ? 0.5 : r;
}

function rayHit(poly, c, a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = null, bt = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const ex = B[0] - A[0], ey = B[1] - A[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((A[0] - c[0]) * ey - (A[1] - c[1]) * ex) / den;
    const u = ((A[0] - c[0]) * dy - (A[1] - c[1]) * dx) / den;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && t < bt) { bt = t; best = [c[0] + t * dx, c[1] + t * dy]; }
  }
  return best || c;
}

/* ------------------------------------------------- wall per unit area ---- */

// Perimeter of a single cell of unit area, for the three regular tilings and
// for the circle. The hexagon is the least among the tilings, which is the
// discrete honeycomb conjecture; the circle, which does not tile, is the
// isoperimetric minimum and is given as the unreachable bound. Each wall is
// shared by two cells, so the comb's total wall is half the sum of these, but
// the ranking is the same, and the per-cell perimeter matches the header.
export function wallPerArea() {
  return {
    hex: Math.sqrt(8 * Math.sqrt(3)),           // regular hexagon, area 1 -> 3.722
    square: 4,                                   // unit square
    tri: Math.sqrt(12 * Math.sqrt(3)),           // equilateral triangle -> 4.559
    circle: 2 * Math.sqrt(Math.PI),              // not a tiling, the bound -> 3.545
  };
}

/* ----------------------------------------------- the cell in 3D (STL) ---- */

// A single comb cell: an open hexagonal prism closed at the back by three
// rhombi meeting at a point, the base of the real bee cell (the rhombic
// dodecahedron's trihedral corner). The closing angle theta sets how far the
// apex is pushed out: 'bee' uses the built angle (the obtuse rhombus angle of
// about 109.47 degrees, the Maraldi angle), 'tothflat' the flat back, and
// 'toth' the closure Fejes Toth (1964) showed to be slightly more economical.
export function cellSolid(o) {
  const kind = o.cell3d || 'bee';
  const R = 1, depth = 2.2, wall = 0.08;
  const H = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; H.push([R * Math.cos(a), R * Math.sin(a)]); }
  const pos = [], idx = []; let base = 0;
  const push = (x, y, z) => { pos.push(x, y, z); return base++; };
  // apex offset of the rhombic base
  const h = kind === 'tothflat' ? 0 : (kind === 'toth' ? 0.75 : 1) * R / Math.SQRT2;
  const mouth = H.map(([x, y]) => push(x, y, depth));
  // three alternating vertices go to the apex plane; the apex on the axis
  const apex = push(0, 0, -h);
  const backRing = H.map(([x, y], k) => push(x, y, (k % 2 === 0) ? -h * 0.0 : 0));
  // simple watertight-ish shell: mouth rim -> three rhombi to apex
  for (let k = 0; k < 6; k++) {
    const a = mouth[k], b = mouth[(k + 1) % 6];
    // side wall quad (two triangles), from mouth down to a mid ring at z=0
    const am = push(H[k][0], H[k][1], 0), bm = push(H[(k + 1) % 6][0], H[(k + 1) % 6][1], 0);
    tri(idx, a, b, bm); tri(idx, a, bm, am);
    // rhombus face to the apex
    tri(idx, am, bm, apex);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx), meta: { h, kind } };
}

function tri(idx, a, b, c) { idx.push(a, b, c); }

// The comb panel as a closed solid for the print: the walls of the relaxed
// cells extruded to a thickness, on a thin floor. Returned as position/index
// arrays. Kept coarse here; the scene passes the same cells it draws.
export function combSolid(o) {
  const { pts, pitch } = centers(o.shape || 'hex', o.cells || 61);
  const vcells = voronoi(pts, pitch);
  const wall = 0.06, depth = 1.0, floor = 0.15;
  const pos = [], idx = []; let base = 0;
  const push = (x, y, z) => { pos.push(x, y, z); return base++; };
  vcells.forEach((poly, i) => {
    if (poly.length < 3) return;
    const c = pts[i];
    for (let k = 0; k < poly.length; k++) {
      const A = poly[k], B = poly[(k + 1) % poly.length];
      // inset edge towards the center by half the wall, shared with the neighbor
      const Ai = inset(A, c, wall / 2), Bi = inset(B, c, wall / 2);
      const t = push(A[0], A[1], floor + depth), u = push(B[0], B[1], floor + depth);
      const ti = push(Ai[0], Ai[1], floor + depth), ui = push(Bi[0], Bi[1], floor + depth);
      quad(idx, t, u, ui, ti);                                   // top of the wall
    }
  });
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx), meta: { cells: vcells.length } };
}

function inset(P, c, d) {
  const dx = c[0] - P[0], dy = c[1] - P[1], L = Math.hypot(dx, dy) || 1;
  return [P[0] + d * dx / L, P[1] + d * dy / L];
}
function quad(idx, a, b, c, d) { idx.push(a, b, c, a, c, d); }

// entry points for the print worker
export function solid(o) { return (o.show === 'cell') ? cellSolid(o) : combSolid(o); }

// Elven amulets: Celtic knots from a planar graph, after the construction
// described by Kaplan and Cohen (2003) and, before them, by Mercat (1997):
// the knot is the medial graph of the plane graph, with a crossing at the
// midpoint of every edge and a strand turning around every corner of every
// face (the outer face included), the strands meeting the edges at 45
// degrees; over and under alternate along every strand. The amulet is a
// relief in two heights on a disc with a bail, or on a shield.

import { implicitSolid } from '../../print/index.js';

/* ------------------------------------------------------------ the graphs -- */

// { V: [[x, y]], E: [[a, b]] }, about unit size, planar straight-line
export function graph(kind, n, k) {
  const V = [], E = [];
  if (kind === 'grid') {
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) V.push([i / n - 0.5, j / n - 0.5]);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      if (i < n) E.push([j * (n + 1) + i, j * (n + 1) + i + 1]);
      if (j < n) E.push([j * (n + 1) + i, (j + 1) * (n + 1) + i]);
    }
  } else if (kind === 'tri') {
    // a hexagon of the triangular lattice, n rings around the center
    const key = new Map(), id = (a, b) => key.get(a + ',' + b);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
      if (Math.abs(a + b) > n) continue;
      key.set(a + ',' + b, V.length);
      V.push([(a + b / 2) / (2 * n), (b * Math.sqrt(3) / 2) / (2 * n)]);
    }
    for (const [s, v] of key) {
      const [a, b] = s.split(',').map(Number);
      for (const [da, db] of [[1, 0], [0, 1], [-1, 1]]) { const w = id(a + da, b + db); if (w !== undefined) E.push([v, w]); }
    }
  } else {
    // a wheel: a center, n rings of k vertices, spokes and rims
    V.push([0, 0]);
    for (let r = 1; r <= n; r++) for (let s = 0; s < k; s++) {
      const a = 2 * Math.PI * (s + (r % 2) * 0.5 * (kind === 'web' ? 1 : 0)) / k + Math.PI / 2;
      V.push([0.5 * r / n * Math.cos(a), 0.5 * r / n * Math.sin(a)]);
    }
    const at = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * k + ((s % k) + k) % k);
    for (let r = 1; r <= n; r++) for (let s = 0; s < k; s++) {
      E.push([at(r, s), at(r, s + 1)]);
      if (r === 1) E.push([0, at(1, s)]);
      else if (kind === 'web') E.push([at(r - 1, s), at(r, s)], [at(r - 1, s + 1), at(r, s)]);
      else E.push([at(r - 1, s), at(r, s)]);
    }
  }
  return { V, E };
}

/* ------------------------------------------------------------ the knot -- */

// the faces of the plane graph by its half-edges: next(u -> v) is v -> w
// with w the neighbor of v just before u counterclockwise; inner faces come
// out counterclockwise, the outer one clockwise
function faces({ V, E }) {
  const nb = V.map(() => []);
  E.forEach(([a, b], e) => { nb[a].push([b, e]); nb[b].push([a, e]); });
  const ang = (v, w) => Math.atan2(V[w][1] - V[v][1], V[w][0] - V[v][0]);
  nb.forEach((L, v) => L.sort((p, q) => ang(v, p[0]) - ang(v, q[0])));
  const seen = new Set(), F = [];
  for (let e = 0; e < E.length; e++) for (const [u, v] of [[E[e][0], E[e][1]], [E[e][1], E[e][0]]]) {
    if (seen.has(u + ',' + v)) continue;
    const cyc = [];
    let a = u, b = v;
    while (!seen.has(a + ',' + b)) {
      seen.add(a + ',' + b);
      const L = nb[b], i = L.findIndex(p => p[0] === a), [w, ew] = L[(i - 1 + L.length) % L.length];
      cyc.push({ from: a, to: b, e: E.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a)) });
      a = b; b = w;
    }
    F.push(cyc);
  }
  return F;
}

const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

// the knot: pieces of strand, each a cubic around one corner of one face,
// with the heights (0 under, 1 over) at its two crossings
export function knot(G) {
  const F = faces(G), { V, E } = G;
  const mid = e => [(V[E[e][0]][0] + V[E[e][1]][0]) / 2, (V[E[e][0]][1] + V[E[e][1]][1]) / 2];
  // the piece of face f around the corner between half-edges h1 (a -> v)
  // and h2 (v -> b); its arm at an edge leaves at 45 degrees between the
  // direction to the corner and the normal into the face (to the left)
  const pieces = [], byKey = new Map();
  F.forEach((cyc, f) => cyc.forEach((h1, i) => {
    const h2 = cyc[(i + 1) % cyc.length], v = h1.to;
    const arm = (h, toV) => {
      const m = mid(h.e), dx = V[h.to][0] - V[h.from][0], dy = V[h.to][1] - V[h.from][1], n = unit(-dy, dx);
      const t = unit(V[toV][0] - m[0], V[toV][1] - m[1]);
      return { m, d: unit(t[0] + n[0], t[1] + n[1]) };
    };
    const p = { f, v, e1: h1.e, e2: h2.e, A: arm(h1, v), B: arm(h2, v) };
    pieces.push(p);
    byKey.set(`${f}|${v}|${h1.e}`, p); byKey.set(`${f}|${v}|${h2.e}`, p);
  }));
  // the other face of each edge
  const facesOf = E.map(() => []);
  F.forEach((cyc, f) => cyc.forEach(h => facesOf[h.e].push(f)));
  // the pass of a piece through the crossing at edge e: pieces (f, v) and
  // (f', w) form one pass, (f, w) and (f', v) the other
  const pass = (e, f, v) => ((facesOf[e][0] === f ? 1 : 0) ^ (E[e][0] === v ? 1 : 0));
  const across = (e, f, v) => {
    const f2 = facesOf[e][0] === f ? facesOf[e][1] : facesOf[e][0], w = E[e][0] === v ? E[e][1] : E[e][0];
    return byKey.get(`${f2}|${w}|${e}`);
  };
  // two-coloring of the passes: the two passes of a crossing differ, and
  // so do the two crossings at the ends of a piece (alternation)
  const state = new Map(), key = (e, s) => e * 2 + s;
  for (const p of pieces) {
    const k0 = key(p.e1, pass(p.e1, p.f, p.v));
    if (state.has(k0)) continue;
    state.set(k0, 1);
    const st = [k0];
    while (st.length) {
      const k = st.pop(), e = k >> 1, s = k & 1, val = state.get(k);
      const nbrs = [[key(e, 1 - s), 1 - val]];
      // the pieces through this pass: their other ends get the other value
      for (const q of pieces) {
        for (const [ea, eb] of [[q.e1, q.e2], [q.e2, q.e1]]) if (ea === e && pass(ea, q.f, q.v) === s) nbrs.push([key(eb, pass(eb, q.f, q.v)), 1 - val]);
      }
      for (const [k2, v2] of nbrs) if (!state.has(k2)) { state.set(k2, v2); st.push(k2); }
    }
  }
  for (const p of pieces) { p.zA = state.get(key(p.e1, pass(p.e1, p.f, p.v))); p.zB = state.get(key(p.e2, pass(p.e2, p.f, p.v))); }
  // strands, for the count
  const seen = new Set();
  let strands = 0;
  for (const p of pieces) {
    if (seen.has(p)) continue;
    strands++;
    let q = p, from = p.e1;
    while (q && !seen.has(q)) {
      seen.add(q);
      const out = q.e1 === from ? q.e2 : q.e1;
      const r2 = across(out, q.f, q.v);
      from = out; q = r2;
    }
  }
  return { pieces, strands, crossings: E.length };
}

// the cubic of a piece, sampled at n + 1 points [x, y, z]
export function curve(p, n = 16) {
  const { m: a, d: da } = p.A, { m: b, d: db } = p.B, L = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.55 + 0.02;
  const c1 = [a[0] + L * da[0], a[1] + L * da[1]], c2 = [b[0] + L * db[0], b[1] + L * db[1]], out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t, z = p.zA + (p.zB - p.zA) * t * t * (3 - 2 * t);
    out.push([s * s * s * a[0] + 3 * s * s * t * c1[0] + 3 * s * t * t * c2[0] + t * t * t * b[0],
      s * s * s * a[1] + 3 * s * s * t * c1[1] + 3 * s * t * t * c2[1] + t * t * t * b[1], z]);
  }
  return out;
}

/* ------------------------------------------------------------ the solid -- */

// the outline of a heater shield of half-width 1: a flat top, the sides
// curving down to a point
function shieldPoly() {
  const P = [[-1, 0.9], [1, 0.9]];
  for (let i = 0; i <= 24; i++) { const t = i / 24; P.push([1 - Math.pow(t, 2.2), 0.9 - 2.6 * t]); }
  return P.slice(0, -1).concat(Array.from({ length: 24 }, (_, i) => { const t = 1 - i / 24; return [-(1 - Math.pow(t, 2.2)), 0.9 - 2.6 * t]; }));
}
const segDist = (x, y, a, b) => {
  const ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey);
};
function polySdf(P) {
  return (x, y) => {
    let d = Infinity, c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      d = Math.min(d, segDist(x, y, P[j], P[i]));
      if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    }
    return c ? -d : d;
  };
}

// o: graph, n, k, shape ('amulet', 'shield'), size (mm, the width), band
// (width of a strand as a fraction of the shortest edge), base, lift, res
export function solid(o, progress) {
  const G = graph(o.graph, o.n, o.k), K = knot(G), size = o.size || 50;
  const pts = K.pieces.map(p => curve(p, 20));
  let ext = 0;
  for (const P of pts) for (const [x, y] of P) ext = Math.max(ext, Math.hypot(x, y));
  const emin = Math.min(...G.E.map(([a, b]) => Math.hypot(G.V[a][0] - G.V[b][0], G.V[a][1] - G.V[b][1])));
  // the knot fills the width less the rim
  const rim = Math.max(1.2, size * 0.035), shield = o.shape === 'shield';
  const R = size / 2, sc = (R - rim - 0.8) / (ext + (o.band ?? 0.32) * emin / 2) * (shield ? 0.82 : 1);
  const w = (o.band ?? 0.32) * emin * sc, gap = Math.max(0.5, 0.18 * w), base = o.base ?? 2, lift = o.lift ?? 1.2;
  const yoff = shield ? 0.25 * R : 0;
  // the height map of the strands, pixel px: per pixel the highest strand
  // within half the band plus the gap; inside the band its rounded top, in
  // the gap a groove down to the base
  const px = size / (o.res === 'fine' ? 420 : o.res === 'draft' ? 300 : 180);
  const x0 = -R - 2, y0 = -R * (shield ? 1.45 : 1) - 2, nx = Math.ceil((2 * R + 4) / px), ny = Math.ceil((R * (shield ? 2.45 : 2.6) + 4) / px);
  const Z = new Float32Array(nx * ny).fill(-1), D = new Float32Array(nx * ny).fill(1e9);
  const reach = w / 2 + gap;
  pts.forEach(P => {
    for (let s = 0; s + 1 < P.length; s++) {
      const a = [P[s][0] * sc, P[s][1] * sc + yoff], b = [P[s + 1][0] * sc, P[s + 1][1] * sc + yoff];
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - x0) / px)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + reach - x0) / px));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - y0) / px)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) + reach - y0) / px));
      const ex = b[0] - a[0], ey = b[1] - a[1], ee = ex * ex + ey * ey || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = x0 + i * px, y = y0 + j * px, t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / ee));
        const d = Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey);
        if (d > reach) continue;
        const z = P[s][2] + t * (P[s + 1][2] - P[s][2]), q = j * nx + i;
        // a strand clearly higher wins (it passes over); between heights
        // close to each other (the same band, whose height changes slowly)
        // the nearer
        if (z > Z[q] + 0.4 || (Math.abs(z - Z[q]) <= 0.4 && d < D[q])) { Z[q] = z; D[q] = d; }
      }
    }
  });
  const H = new Float32Array(nx * ny);
  for (let q = 0; q < nx * ny; q++) {
    if (Z[q] < 0 || D[q] > w / 2) { H[q] = base; continue; }
    const u = D[q] / (w / 2);
    H[q] = base + lift * (0.45 + 0.55 * Z[q]) + 0.5 * lift * (1 - u * u) * 0.6;
  }
  if (progress) progress(0.3);
  const top = base + lift * 1.3;
  const hAt = (x, y) => {
    const fx = (x - x0) / px, fy = (y - y0) / px, i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - i)), ty = Math.min(1, Math.max(0, fy - j));
    const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  // the outline: a disc with a bail on top, or a shield
  const SP = shieldPoly().map(([x, y]) => [x * R, y * R]), sh = polySdf(SP);
  const outline = shield ? sh : (x, y) => Math.hypot(x, y) - R;
  const br = Math.max(3, 0.16 * R), by = R + br * 0.55;
  const bail = (x, y) => Math.max(Math.hypot(x, y - by) - br, 0.5 * br - Math.hypot(x, y - by));
  const f = (x, y, z) => {
    const o2 = outline(x, y);
    // the rim: a band of width rim inside the outline, as high as the strands
    let hgt = o2 > -rim ? top : hAt(x, y);
    let v = Math.max(z - hgt, -z, o2);
    if (!shield) v = Math.min(v, Math.max(bail(x, y), -z, z - base));
    return v;
  };
  const h = px * 1.3;
  const m = implicitSolid(f, [[x0, y0, 0], [x0 + nx * px, y0 + ny * px + (shield ? 0 : br * 2), top + 0.5]], h, { crumbs: 0.02, progress: p => progress && progress(0.3 + 0.7 * p) });
  m.strands = K.strands; m.crossings = K.crossings;
  return m;
}

// the view: the solid and the knot as polylines for the drawing
export function preview(o, progress) {
  const m = solid(o, progress), G = graph(o.graph, o.n, o.k), K = knot(G);
  m.curves = K.pieces.map(p => curve(p, 16));
  m.V = G.V; m.E = G.E;
  return m;
}

export const fileName = o => `elven_knot_${o.shape}_${o.graph}_${o.n}_${o.k}_${o.size}mm`;

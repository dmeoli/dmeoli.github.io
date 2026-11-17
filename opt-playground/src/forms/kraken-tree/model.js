// Kraken and elven tree: branching grown by space colonization (Runions,
// Lane and Prusinkiewicz 2007). A cloud of attraction points fills the volume
// the form should occupy; at each step every point pulls the node of the
// growing tree nearest to it (within the radius of influence), every node
// that is pulled grows a new node one step D along the mean of the unit
// vectors to its points (plus an upward bias, which keeps the branches
// printable), and the points within the kill distance of a node are removed.
// The radii follow the pipe model of Leonardo: at a fork r^gamma = sum of
// the children's r^gamma, with gamma = 2 for Leonardo's rule, the tips at the
// smallest printable radius. Two scenes: an elven tree, whose crown fills a
// volume around a tree house on a platform, and a kraken, whose tentacles
// (growing only at their tips, so that they do not branch) climb out of the
// sea around a ship. Units: millimetres for a form 100 mm tall, scaled at the
// end. No DOM: the model runs in workers.

import { implicitSolid, tube, merge, transform, bounds } from '../../print/index.js';
import { rng } from '../fantasy/util.js';

export const DEFAULTS = { scene: 'tree', seed: 3, points: 600, di: 16, dk: 4, D: 2, up: 0.6, gamma: 2.5, rmin: 0.8 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.hypot(a[0], a[1], a[2]);

/* ------------------------------------------------- the fixed parts -- */

const ell = (x, y, z, a, b, c) => { const k = Math.hypot(x / a, y / b, z / c); return (k - 1) * Math.min(a, b, c); };
const cyl = (x, y, z, r, z0, z1) => { const dr = Math.hypot(x, y) - r, dz = Math.max(z0 - z, z - z1); return Math.hypot(Math.max(dr, 0), Math.max(dz, 0)) + Math.min(Math.max(dr, dz), 0); };
const boxD = (x, y, z, a, b, c) => { const qx = Math.abs(x) - a, qy = Math.abs(y) - b, qz = Math.abs(z) - c; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0); };

// the tree house: a platform around the trunk at height zp, carried by a
// cone at 45 degrees, and a round hut with a conical roof and a door
const ZP = 36;
function house(x, y, z) {
  const r = Math.hypot(x, y);
  let f = Math.max(r - 15, z - (ZP + 1.6), (ZP - 15) - z, r - (z - (ZP - 15)) - 1);
  f = Math.min(f, Math.max(cyl(x - 4, y, z, 7, ZP, ZP + 9), -cyl(x - 4, y, z, 5.6, ZP + 1.6, ZP + 9.2)));
  const rr = Math.hypot(x - 4, y), roof = Math.max((rr - 9) * 0.8 + (z - (ZP + 9)) * 0.6, ZP + 8.6 - z);
  f = Math.min(f, roof);
  // the door, facing out
  f = Math.max(f, -boxD(x - 10.5, y, z - (ZP + 5), 2.5, 2, 3.4));
  return f;
}
const HOUSE_KEEP = (x, y, z) => Math.hypot(x - 4, y) < 14 && z > ZP - 3 && z < ZP + 22;

// the ship: a hull (a slice of an ellipsoid, widest halfway up) with a deck, a mast and a
// triangular sail in the plane of the keel; the kraken's head beside it
function ship(x, y, z) {
  let f = Math.max(ell(x, y, z - 6, 30, 10, 10), -z, z - 12);
  f = Math.max(f, -Math.max(ell(x, y, z - 6, 28.4, 8.4, 9), 10.5 - z));    // the deck sunk in the hull
  f = Math.min(f, cyl(x + 2, y, z, 1.5, 1, 54));                           // the mast
  // the sail: a triangle (mast top, bow, mast foot) 1.4 mm thick
  const inTri = Math.max(-(x + 2), (x + 2) / 24 + (z - 12) / 42 - 1, 12 - z);
  f = Math.min(f, Math.max(inTri, Math.abs(y) - 0.7));
  return f;
}
const HEAD = [-6, 32, 0];
function head(x, y, z) {
  let f = ell(x - HEAD[0], y - HEAD[1], z, 13, 11, 22);
  for (const s of [-1, 1]) f = Math.min(f, Math.hypot(x - s * 6, y - (HEAD[1] - 9), z - 9) - 3);
  return Math.max(f, -z - 1);
}
const sea = (x, y, z) => Math.max(boxD(x, y, z - 0.5, 48, 44, 3.5) - 1, z - (0.4 + 0.6 * Math.sin(x / 4.2 + 0.8 * Math.sin(y / 7)) * Math.cos(y / 5.5)));

export function staticPart(scene) {
  if (scene === 'kraken') return (x, y, z) => Math.min(sea(x, y, z), ship(x, y, z), head(x, y, z));
  return (x, y, z) => Math.min(cyl(x, y, z, 24, -3, 0) - 0.5, house(x, y, z));
}

/* -------------------------------------------------- the attractors -- */

function attractors(o) {
  const r = rng(o.seed * 101 + 13), P = [];
  let tries = 0;
  if (o.scene === 'kraken') {
    // a shell from 2.5 to 9 mm around the ship, denser upwards
    while (P.length < o.points && tries++ < 200 * o.points) {
      const p = [r.range(-40, 40), r.range(-22, 22), r.range(1, 58)];
      const d = ship(...p);
      if (d < 2.5 || d > 8 || p[2] > 48) continue;
      if (r() > 0.35 + 0.65 * p[2] / 48) continue;
      P.push(p);
    }
  } else {
    // a crown: an ellipsoid above the house, denser upwards, minus the house
    while (P.length < o.points && tries++ < 200 * o.points) {
      const p = [r.range(-36, 36), r.range(-36, 36), r.range(40, 98)];
      if (ell(p[0], p[1], p[2] - 72, 36, 36, 26) > 0) continue;
      if (HOUSE_KEEP(...p)) continue;
      if (r() > 0.3 + 0.7 * (p[2] - 40) / 58) continue;
      P.push(p);
    }
  }
  return P;
}

/* ------------------------------------------------ space colonization -- */

// a hash of points by cells of side c
class Cells {
  constructor(c) { this.c = c; this.m = new Map(); }
  key(p) { return ((Math.floor(p[0] / this.c) + 512) * 1024 + (Math.floor(p[1] / this.c) + 512)) * 1024 + (Math.floor(p[2] / this.c) + 512); }
  add(p, i) { const k = this.key(p); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(i); }
  near(p, f) {
    const c = this.c, X = Math.floor(p[0] / c), Y = Math.floor(p[1] / c), Z = Math.floor(p[2] / c);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const a = this.m.get(((X + i + 512) * 1024 + (Y + j + 512)) * 1024 + (Z + k + 512));
      if (a) for (const q of a) f(q);
    }
  }
}

// the grown structure: nodes { p, parent } (the parent before the child),
// with radii by the pipe model (tree) or tapering along each tentacle
export function grow(o, progress) {
  const q = { ...DEFAULTS, ...o };
  const A = attractors(q), alive = new Uint8Array(A.length).fill(1);
  const N = [], tips = new Set();
  const add = (p, parent, dir) => { N.push({ p, parent, dir, kids: 0, root: parent >= 0 ? N[parent].root : N.length }); if (parent >= 0) N[parent].kids++; return N.length - 1; };
  const kraken = q.scene === 'kraken';
  if (kraken) {
    // the roots of the tentacles, on the water around the ship and out of the head
    const r = rng(q.seed * 7 + 3), k = 8;
    for (let i = 0; i < k; i++) {
      const a = 2 * Math.PI * (i + 0.2 + 0.5 * r()) / k, p = [40 * Math.cos(a), 25 * Math.sin(a), 0.5];
      if (Math.hypot(p[0] - HEAD[0], p[1] - HEAD[1]) < 16) { p[0] = HEAD[0] + 12 * Math.cos(a); p[1] = HEAD[1] - 8; p[2] = 6; }
      const d = [-Math.cos(a), -Math.sin(a), 1.3], l = len(d);
      tips.add(add(p, -1, d.map(v => v / l)));
    }
  } else {
    // the trunk leans and bends a little, from the seed
    const r = rng(q.seed * 5 + 1), a = r() * 2 * Math.PI, b = 0.12 * r();
    tips.add(add([0, 0, 0], -1, [b * Math.cos(a), b * Math.sin(a), 1].map(v => v / Math.hypot(b, 1))));
  }
  const D = q.D, di = q.di, dk = q.dk, maxLen = kraken ? 95 / D : Infinity;
  const steps = new Map();
  let cells = new Cells(di);
  N.forEach((n, i) => cells.add(n.p, i));
  for (let it = 0; it < 400; it++) {
    // each attractor pulls its nearest node (a tip, for the kraken)
    const pull = new Map();
    for (let a = 0; a < A.length; a++) {
      if (!alive[a]) continue;
      let best = -1, bd = di;
      cells.near(A[a], i => {
        if (kraken ? !tips.has(i) : N[i].p[2] < ZP + 2) return;
        const d = len(sub(A[a], N[i].p));
        if (d < bd) { bd = d; best = i; }
      });
      if (best < 0) continue;
      const v = sub(A[a], N[best].p), l = len(v) || 1;
      const acc = pull.get(best) || [0, 0, 0, 0];
      acc[0] += v[0] / l; acc[1] += v[1] / l; acc[2] += v[2] / l; acc[3]++;
      pull.set(best, acc);
    }
    // the nodes with nothing to pull them: the trunk and the tentacles go on
    // along their direction until they reach the points
    if (!pull.size) {
      let grew = false;
      for (const i of [...tips]) {
        if ((steps.get(i) || 0) > maxLen) continue;
        const d = N[i].dir, p = N[i].p;
        if (!kraken && p[2] > 95) continue;
        const j = add([p[0] + D * d[0], p[1] + D * d[1], p[2] + D * d[2]], i, d);
        tips.delete(i); tips.add(j); steps.set(j, (steps.get(i) || 0) + 1); cells.add(N[j].p, j); grew = true;
      }
      if (!grew) break;
      continue;
    }
    const fresh = [];
    for (const [i, acc] of pull) {
      if (kraken && (steps.get(i) || 0) > maxLen) continue;
      let d = [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3] + (kraken ? 0.3 : 1) * q.up];
      if (kraken) {
        // a tentacle sways from side to side as it climbs
        const w = 0.4 * Math.sin(0.3 * (steps.get(i) || 0) + 2.1 * N[i].root), h = Math.hypot(d[0], d[1]) || 1;
        d = [d[0] - w * d[1] / h, d[1] + w * d[0] / h, d[2]];
      }
      const l = len(d);
      if (l < 1e-6) continue;
      d = [d[0] / l, d[1] / l, d[2] / l];
      // no branch grows downwards
      if (d[2] < 0) { d[2] = 0; const h = Math.hypot(d[0], d[1]) || 1; d[0] /= h; d[1] /= h; }
      const p = N[i].p, np = [p[0] + D * d[0], p[1] + D * d[1], p[2] + D * d[2]];
      // no second child in the same place
      let dup = false;
      cells.near(np, k => { if (N[k].parent === i && len(sub(N[k].p, np)) < 0.4 * D) dup = true; });
      if (dup || np[2] < 0.5) continue;
      const j = add(np, i, d);
      steps.set(j, (steps.get(i) || 0) + 1);
      if (kraken) { tips.delete(i); }
      tips.add(j); fresh.push(j); cells.add(np, j);
    }
    // tentacles not pulled go on along their direction, bending to the ship
    const grown = new Set(fresh);
    if (kraken) for (const i of [...tips]) {
      if (pull.has(i) || grown.has(i) || (steps.get(i) || 0) > maxLen || N[i].kids) continue;
      const p = N[i].p, d0 = N[i].dir, to = [-p[0], -p[1], 20 - p[2]], l0 = len(to) || 1;
      let d = [d0[0] + 0.3 * to[0] / l0, d0[1] + 0.3 * to[1] / l0, d0[2] + 0.3 * to[2] / l0];
      const l = len(d); d = [d[0] / l, d[1] / l, d[2] / l];
      const j = add([p[0] + D * d[0], p[1] + D * d[1], p[2] + D * d[2]], i, d);
      tips.delete(i); tips.add(j); steps.set(j, (steps.get(i) || 0) + 1); cells.add(N[j].p, j); fresh.push(j);
    }
    if (!fresh.length) break;
    // the points reached are removed
    for (const j of fresh) for (let a = 0; a < A.length; a++) if (alive[a] && len(sub(A[a], N[j].p)) < dk) alive[a] = 0;
    if (progress && (it & 3) === 0) progress(Math.min(0.5, it / 300));
  }
  // radii
  const R = new Float64Array(N.length), g = q.gamma, rmin = q.rmin;
  if (kraken) {
    // each tentacle tapers from 3.2 mm (or less, if short) to rmin at its tip
    const depth = new Float64Array(N.length);
    for (let i = N.length - 1; i >= 0; i--) if (N[i].parent >= 0) depth[N[i].parent] = Math.max(depth[N[i].parent], depth[i] + 1);
    let maxd = 1;
    for (const v of depth) maxd = Math.max(maxd, v);
    for (let i = 0; i < N.length; i++) R[i] = rmin + (3.2 - rmin) * Math.pow(depth[i] / maxd, 0.8);
  } else {
    const S = new Float64Array(N.length);
    for (let i = N.length - 1; i >= 0; i--) {
      if (!N[i].kids) S[i] = Math.pow(rmin, g);
      if (N[i].parent >= 0) S[N[i].parent] += S[i];
    }
    for (let i = 0; i < N.length; i++) R[i] = Math.pow(S[i], 1 / g);
  }
  const left = alive.reduce((s, v) => s + v, 0);
  return { N, R, A, alive, left };
}

/* ------------------------------------------------------------- solid -- */

// the segments child-parent as round cones; the share of their length that
// runs flatter than 45 degrees (it prints only with supports, or as a short
// bridge)
function segments(G) {
  const S = [];
  let all = 0, flat = 0;
  G.N.forEach((n, i) => {
    if (n.parent < 0) return;
    const a = G.N[n.parent].p, b = n.p, l = len(sub(b, a));
    S.push({ a, b, ra: G.R[n.parent], rb: G.R[i] });
    all += l;
    if (Math.abs(b[2] - a[2]) < 0.7071 * l) flat += l;
  });
  return { S, flat: flat / (all || 1) };
}

// the branches as tubes, one per run between forks (the preview)
function tubes(G, sides = 8) {
  const out = [], N = G.N, kids = N.map(() => []);
  N.forEach((n, i) => { if (n.parent >= 0) kids[n.parent].push(i); });
  const run = start => {
    const pts = [N[start].parent >= 0 ? N[N[start].parent].p : N[start].p], rs = [G.R[N[start].parent >= 0 ? N[start].parent : start]];
    let i = start;
    for (;;) { pts.push(N[i].p); rs.push(G.R[i]); if (kids[i].length !== 1) break; i = kids[i][0]; }
    if (pts.length >= 2) out.push(tube(pts, t => rs[Math.min(rs.length - 1, Math.round(t * (rs.length - 1)))], { sides }));
    for (const k of kids[i]) run(k);
  };
  N.forEach((n, i) => { if (n.parent < 0) for (const k of kids[i]) run(k); });
  return out;
}

export function fileName(o) { return `${o.scene || 'tree'}_space_colonization_seed${o.seed}_${o.size}mm`; }

// o: the parameters of grow, size (mm, the height of the form), res
export function solid(o, progress) {
  const q = { ...DEFAULTS, ...o }, k = (q.size || 100) / 100;
  // the smallest radius is asked in mm of the print: grow at the scale of 100
  const G = grow({ ...q, rmin: q.rmin / k }, progress);
  const { S, flat } = segments(G), fixed = staticPart(q.scene);
  const kraken = q.scene === 'kraken';
  const box = kraken ? [[-50, -46, -3.5], [50, 46, 60]] : [[-40, -40, -3.5], [40, 40, 100]];
  let m;
  if (q.res === 'preview') {
    m = merge(implicitSolid(fixed, box, 1.4, { crumbs: 0 }), ...tubes(G));
  } else {
    // the union of the round cones, found through a grid of cells
    const c = 4, cells = new Map(), key = (i, j, l) => (i * 4096 + j) * 4096 + l;
    S.forEach((s, n) => {
      const r = Math.max(s.ra, s.rb) + c;
      for (let i = Math.floor((Math.min(s.a[0], s.b[0]) - r) / c) + 2048; i <= Math.floor((Math.max(s.a[0], s.b[0]) + r) / c) + 2048; i++)
        for (let j = Math.floor((Math.min(s.a[1], s.b[1]) - r) / c) + 2048; j <= Math.floor((Math.max(s.a[1], s.b[1]) + r) / c) + 2048; j++)
          for (let l = Math.floor((Math.min(s.a[2], s.b[2]) - r) / c) + 2048; l <= Math.floor((Math.max(s.a[2], s.b[2]) + r) / c) + 2048; l++) {
            const K = key(i, j, l); let a = cells.get(K); if (!a) cells.set(K, a = []); a.push(n);
          }
    });
    const f = (x, y, z) => {
      let v = fixed(x, y, z);
      const a = cells.get(key(Math.floor(x / c) + 2048, Math.floor(y / c) + 2048, Math.floor(z / c) + 2048));
      if (a) for (const n of a) {
        const s = S[n], ex = s.b[0] - s.a[0], ey = s.b[1] - s.a[1], ez = s.b[2] - s.a[2];
        const wx = x - s.a[0], wy = y - s.a[1], wz = z - s.a[2], L2 = ex * ex + ey * ey + ez * ez || 1;
        const t = Math.max(0, Math.min(1, (wx * ex + wy * ey + wz * ez) / L2));
        const d = Math.hypot(wx - t * ex, wy - t * ey, wz - t * ez) - (s.ra + t * (s.rb - s.ra));
        if (d < v) v = d;
      }
      return v;
    };
    const h = (q.res === 'fine' ? 0.32 : 0.45) / k;
    m = implicitSolid(f, box, h, { progress: p => progress && progress(0.5 + 0.5 * p) });
  }
  transform(m, ([x, y, z]) => [x * k, y * k, (z + 3.5) * k]);
  const [mn, mx] = bounds(m);
  m.dims = mx.map((v, i) => v - mn[i]);
  m.nodes = G.N.length; m.left = G.left; m.points = G.A.length; m.flat = flat;
  m.trunk = G.R[0] * k;
  if (q.res === 'preview') {
    // a side view for the page: the points (x, z, still there) and the
    // segments with their radii
    m.att = G.A.flatMap((p, i) => [+p[0].toFixed(1), +p[2].toFixed(1), G.alive[i]]);
    m.skel = S.flatMap(s => [+s.a[0].toFixed(1), +s.a[2].toFixed(1), +s.b[0].toFixed(1), +s.b[2].toFixed(1), +s.rb.toFixed(2)]);
  }
  return m;
}

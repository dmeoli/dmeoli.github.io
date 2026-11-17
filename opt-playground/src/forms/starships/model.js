// A fleet of starships from a shape grammar searched by a genetic algorithm,
// after ShapeGenetics (Haubenwallner, Seidel and Steinberger 2017). A ship is
// the derivation of a small grammar whose every choice (which alternative a
// rule takes, and every length and angle) is read in turn from a genome of
// numbers in [0, 1), as in grammatical evolution; the parts are the
// superquadrics of the robots (src/forms/robots), turned only about the
// vertical axis, centred on the plane z = 0 and mirrored left to right, so
// that the ship is the union of half superquadrics standing on that plane:
// a height field over its top view, with a flat back and no overhang. The
// fitness compares the top view with a target outline, the bulk with a
// target, and the fore and aft halves with a target symmetry.

import { implicitSolid, merge, transform, onBed, bounds } from '../../print/index.js';
import { rng, field } from '../robots/model.js';

export const GENES = 40;

/* ------------------------------------------------------------- the parts -- */

// a half superquadric centred at (x, y, 0), half sizes a (across), b (along),
// c (up), turned by phi about z; the format of field() in the robots
function part(kind, x, y, a, b, c, e1, e2, phi = 0) {
  const co = Math.cos(phi), si = Math.sin(phi);
  return { kind, c: [x, y, 0], s: [a, b, c], e1, e2, R: [co, si, 0, -si, co, 0, 0, 0, 1], phi, m: Math.min(a, b, c), r: Math.hypot(a, b, c) };
}
const mirror = P => part(P.kind, -P.c[0], P.c[1], P.s[0], P.s[1], P.s[2], P.e1, P.e2, -P.phi);

// the height of a part over (x, y): F <= 1 inside, with
// G = |u/a|^(2/e2) + |v/b|^(2/e2) and F = G^(e2/e1) + |z/c|^(2/e1),
// so that z <= c (1 - G^(e2/e1))^(e1/2) wherever G < 1
export function partHeight(P, x, y) {
  const dx = x - P.c[0], dy = y - P.c[1];
  if (dx * dx + dy * dy > P.r * P.r) return 0;
  const u = Math.abs(P.R[0] * dx + P.R[1] * dy) / P.s[0], v = Math.abs(P.R[3] * dx + P.R[4] * dy) / P.s[1];
  const G = u ** (2 / P.e2) + v ** (2 / P.e2);
  if (G >= 1) return 0;
  return P.s[2] * Math.max(0, 1 - G ** (P.e2 / P.e1)) ** (P.e1 / 2);
}

/* ----------------------------------------------------------- the grammar -- */

export const RULES = {
  Nose: ['needle', 'blunt', 'prongs'],
  Wings: ['none', 'delta', 'straight', 'forward', 'twin'],
  Engines: ['1 pair', '2 pairs', '3 pairs'],
  Cockpit: ['bubble', 'slit', 'none'],
  Fins: ['none', 'tail', 'wingtip pods'],
  Greebles: ['0', '1 pair', '2 pairs', '3 pairs'],
};

// the ship of a genome: { parts, choices }, x across, y along (the nose at
// +y), z up, about 10 units long, centred on its box
export function derive(g) {
  let i = 0;
  const next = () => g[i++ % g.length];
  const U = (a, b) => a + (b - a) * next();
  const pick = k => { const r = RULES[k]; const c = r[Math.min(r.length - 1, Math.floor(next() * r.length))]; ch[k] = c; return c; };
  const ch = {}, P = [], side = [];
  /* Hull */
  const L = U(5, 9), W = U(0.6, 1.5), H = U(0.5, 1.1), e1 = U(0.35, 1), e2 = U(0.3, 1.1);
  P.push(part('hull', 0, 0, W, L / 2, H, e1, e2));
  /* Nose */
  const nose = pick('Nose');
  if (nose === 'needle') P.push(part('hull', 0, L * U(0.4, 0.55), W * U(0.3, 0.5), L * U(0.2, 0.32), H * 0.7, 0.8, 0.45));
  else if (nose === 'blunt') P.push(part('hull', 0, L * 0.42, W * U(0.9, 1.3), W * U(0.8, 1.2), H * 1.05, 1, 1));
  else side.push(part('hull', W * U(0.45, 0.8), L * U(0.38, 0.5), W * U(0.2, 0.32), L * U(0.15, 0.25), H * 0.6, 0.8, 0.5));
  /* Wings: span S, chord C, height T, placed at yw along the hull */
  const wings = pick('Wings');
  const S = U(1.6, 5), C = U(0.8, 2.6), T = U(0.15, 0.4), yw = L * U(-0.3, 0.15), we = U(0.25, 0.8);
  const wing = (y, phi, k = 1) => side.push(part('wing', (W * 0.6 + S * k / 2) * Math.cos(phi), y + (S * k / 2) * Math.sin(phi), S * k / 2 + W * 0.3, C * k / 2, T, 0.6, we, phi));
  if (wings === 'delta') wing(yw, -U(0.35, 0.8));
  else if (wings === 'straight') wing(yw, 0);
  else if (wings === 'forward') wing(yw, U(0.2, 0.5));
  else if (wings === 'twin') { wing(yw + L * 0.12, -U(0, 0.4), 0.75); wing(yw - L * 0.22, -U(0.1, 0.6), 0.9); }
  /* Engines: k pairs of nacelles at the stern */
  const k = 1 + RULES.Engines.indexOf(pick('Engines'));
  const rn = U(0.25, 0.55), ln = U(1, 2.6), spread = U(0.5, 1.6);
  for (let j = 0; j < k; j++) side.push(part('engine', W * 0.6 + rn + j * rn * 2 * spread, -L / 2 + ln * 0.35 + j * U(0, 0.8), rn, ln / 2, rn * U(1.1, 1.6), 1, 0.3));
  /* Cockpit */
  const cockpit = pick('Cockpit');
  if (cockpit === 'bubble') P.push(part('cockpit', 0, L * U(0.05, 0.3), W * U(0.35, 0.55), L * U(0.08, 0.14), H * U(1.3, 1.6), 1, 1));
  else if (cockpit === 'slit') P.push(part('cockpit', 0, L * U(0.1, 0.3), W * 0.2, L * U(0.12, 0.2), H * U(1.15, 1.35), 0.5, 0.4));
  /* Fins */
  const fins = pick('Fins');
  if (fins === 'tail') P.push(part('fin', 0, -L * U(0.25, 0.4), 0.16, L * U(0.1, 0.18), H * U(1.6, 2.2), 0.6, 0.35));
  else if (fins === 'wingtip pods' && wings !== 'none') {
    const w = side.find(p => p.kind === 'wing'), r = w.s[0] - 0.1;
    side.push(part('engine', w.c[0] + r * Math.cos(w.phi), w.c[1] + r * Math.sin(w.phi), 0.28, C * 0.6, 0.4, 1, 0.5));
  }
  /* Greebles: boxes along the flanks */
  const ng = RULES.Greebles.indexOf(pick('Greebles'));
  for (let j = 0; j < ng; j++) side.push(part('greeble', W * U(0.5, 0.95), L * U(-0.4, 0.35), U(0.15, 0.35), U(0.2, 0.7), H * U(0.6, 1.15), 0.25, 0.25));
  for (const p of side) P.push(p, mirror(p));
  // centred on its box along y
  const [lo, hi] = box(P, 0), dy = -(lo[1] + hi[1]) / 2;
  return { parts: P.map(p => part(p.kind, p.c[0], p.c[1] + dy, p.s[0], p.s[1], p.s[2], p.e1, p.e2, p.phi)), choices: ch };
}

// the box around the parts, z from 0
export function box(parts, pad = 0.3) {
  const lo = [Infinity, Infinity, 0], hi = [-Infinity, -Infinity, -Infinity];
  for (const P of parts) for (let a = 0; a < 3; a++) {
    const e = Math.abs(P.R[a]) * P.s[0] + Math.abs(P.R[3 + a]) * P.s[1] + Math.abs(P.R[6 + a]) * P.s[2];
    lo[a] = Math.min(lo[a], P.c[a] - e); hi[a] = Math.max(hi[a], P.c[a] + e);
  }
  lo[2] = 0;
  return [lo.map((v, a) => (a === 2 ? v : v - pad)), hi.map(v => v + pad)];
}

/* -------------------------------------------------- top view and fitness -- */

// the frame of the comparison: [-F, F]^2 in units, n x n cells
export const F = 6, N = 48;
const cell = 2 * F / N;
const cx = i => -F + (i + 0.5) * cell;

// the target outlines in the frame, nose up
export const TARGETS = {
  dart: [[[0, 5.5], [-4.6, -4.8], [4.6, -4.8]]],
  arrow: [[[0, 5.6], [-3.6, -0.8], [-1.2, -0.8], [-1.2, -5.2], [1.2, -5.2], [1.2, -0.8], [3.6, -0.8]]],
  cross: [[[-0.9, 5.4], [-0.9, -5.4], [0.9, -5.4], [0.9, 5.4]], [[-5, 0.6], [-5, -1.6], [5, -1.6], [5, 0.6]]],
  hammer: [[[-0.9, 3], [-0.9, -5.4], [0.9, -5.4], [0.9, 3]], [[-4.6, 4.6], [-4.6, 1.8], [4.6, 1.8], [4.6, 4.6]]],
  saucer: [Array.from({ length: 40 }, (_, k) => [4.6 * Math.cos(2 * Math.PI * k / 40), 4.6 * Math.sin(2 * Math.PI * k / 40)])],
};
const inPoly = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const masks = {};
export function targetMask(name) {
  if (!masks[name]) {
    const M = new Uint8Array(N * N), polys = TARGETS[name] || TARGETS.dart;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) M[j * N + i] = polys.some(p => inPoly(cx(i), cx(j), p)) ? 1 : 0;
    masks[name] = M;
  }
  return masks[name];
}

// the height map of a ship on the frame (row j is y, column i is x)
export function heightMap(parts) {
  const Hm = new Float32Array(N * N);
  for (const P of parts) {
    const i0 = Math.max(0, Math.floor((P.c[0] - P.r + F) / cell)), i1 = Math.min(N - 1, Math.ceil((P.c[0] + P.r + F) / cell));
    const j0 = Math.max(0, Math.floor((P.c[1] - P.r + F) / cell)), j1 = Math.min(N - 1, Math.ceil((P.c[1] + P.r + F) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const h = partHeight(P, cx(i), cx(j));
      if (h > Hm[j * N + i]) Hm[j * N + i] = h;
    }
  }
  return Hm;
}

export const HMAX = 2;
// the three measures and the fitness of a height map against the targets
// o.target (outline), o.bulk (mean height over the top view, as a fraction
// of HMAX) and o.sym (overlap of the top view with its fore and aft mirror)
export function measure(Hm, o) {
  const T = targetMask(o.target);
  let inter = 0, uni = 0, area = 0, vol = 0, si = 0, su = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const s = Hm[j * N + i] > 0 ? 1 : 0, t = T[j * N + i], m = Hm[(N - 1 - j) * N + i] > 0 ? 1 : 0;
    inter += s & t; uni += s | t; area += s; vol += Hm[j * N + i];
    si += s & m; su += s | m;
  }
  const iou = uni ? inter / uni : 0, bulk = area ? vol / (area * HMAX) : 0, sym = su ? si / su : 0;
  const fv = Math.max(0, 1 - Math.abs(bulk - o.bulk) / 0.3), fs = 1 - Math.abs(sym - o.sym);
  return { iou, bulk, sym, fitness: 0.6 * iou + 0.2 * fv + 0.2 * fs };
}

/* ------------------------------------------------- the genetic algorithm -- */

// the population after o.gens generations from o.seed, with o.pop
// individuals, mutation rate o.mut per gene: tournaments of 3, uniform
// crossover, Gaussian mutation, the 2 best kept (elitism). Deterministic:
// the same settings give the same fleet. Returns { pop: [{ g, f, iou, bulk,
// sym }] sorted by fitness, history: [[best, mean], ...] }
export function evolve(o, from = null, gens = o.gens) {
  const R = from ? from.rng : rng(o.seed * 7919 + 13);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  const score = g => ({ g, ...measure(heightMap(derive(g).parts), o) });
  let pop = from ? from.pop : Array.from({ length: o.pop }, () => score(Array.from({ length: GENES }, () => R())));
  const history = from ? from.history : [];
  const sort = () => pop.sort((a, b) => b.fitness - a.fitness);
  const record = () => history.push([pop[0].fitness, pop.reduce((s, p) => s + p.fitness, 0) / pop.length]);
  sort();
  if (!from) record();
  const tour = () => { let b = pop[Math.floor(R() * pop.length)]; for (let k = 1; k < 3; k++) { const c = pop[Math.floor(R() * pop.length)]; if (c.fitness > b.fitness) b = c; } return b; };
  for (let gen = 0; gen < gens; gen++) {
    const next = pop.slice(0, 2);
    while (next.length < o.pop) {
      const a = tour().g, b = tour().g;
      const child = a.map((v, k) => {
        let x = R() < 0.5 ? v : b[k];
        if (R() < o.mut) x += 0.15 * gauss();
        return x - Math.floor(x);   // wrapped into [0, 1)
      });
      next.push(score(child));
    }
    pop = next; sort(); record();
  }
  return { pop, history, rng: R };
}

/* ------------------------------------------------------------- the solid -- */

// the solid of a ship in mm, its length `size`, its back on the bed
export function shipSolid(g, size, h, progress) {
  const D = derive(g), [lo0, hi0] = box(D.parts, 0), k = size / (hi0[1] - lo0[1]);
  const parts = D.parts.map(p => part(p.kind, p.c[0] * k, p.c[1] * k, p.s[0] * k, p.s[1] * k, p.s[2] * k, p.e1, p.e2, p.phi));
  const f = field(parts), fl = (x, y, z) => Math.max(f(x, y, z), -z);
  const [lo, hi] = box(parts, 1);
  lo[2] = -h * 0.5;
  return implicitSolid(fl, [lo, hi], h, { progress });
}

// the fleet for the view: every genome of o.genomes, side by side in rows
// of four, at a coarse grid; m.sel and m.selCount are the triangles of the
// chosen ship (o.pick)
export function fleetMesh(o) {
  const out = [], cols = 4, gap = 0.5;
  let sel = 0, selCount = 0, tri = 0;
  o.genomes.forEach((g, n) => {
    const m = shipSolid(g, 10, 0.22);
    const [lo, hi] = bounds(m), x = (n % cols) * (13 + gap), y = -Math.floor(n / cols) * (11 + gap);
    transform(m, ([a, b, c]) => [a - (lo[0] + hi[0]) / 2 + x, b - (lo[1] + hi[1]) / 2 + y, c]);
    if (n === o.pick) { sel = tri; selCount = m.idx.length / 3; }
    tri += m.idx.length / 3;
    out.push(m);
  });
  const all = merge(...out);
  all.sel = sel; all.selCount = selCount;
  return all;
}

// the printed solid: o as in evolve() plus pick (the rank of the ship in the
// fleet), size (the length, mm), what ('one' | 'four': the four best side
// by side), res ('draft' | 'fine')
export function solid(o, progress) {
  const E = evolve(o), size = o.size || 80, h = o.res === 'fine' ? Math.max(0.22, size / 220) : Math.max(0.35, size / 130);
  const ids = o.what === 'four' ? [0, 1, 2, 3] : [Math.min(o.pick || 0, E.pop.length - 1)];
  const out = [];
  let x = 0;
  ids.forEach((r, k) => {
    const m = shipSolid(E.pop[r].g, size, h, p => progress && progress((k + p) / ids.length));
    const [lo, hi] = bounds(m);
    transform(m, ([a, b, c]) => [a - lo[0] + x, b, c]);
    x += hi[0] - lo[0] + 5;
    out.push(m);
  });
  return onBed(merge(...out));
}

export const fileName = o => `starship_${o.target}_s${o.seed}_g${o.gens}_${o.what === 'four' ? 'four' : 'n' + o.pick}_${o.size}mm`;

// Monsters typed by mathematics: a body grown by the genes of the biomorphs
// (src/forms/biomorphs/model.js: spheres, ellipsoids and round cones joined
// by a smooth union) carries the parts of its type, each made by one family
// of generative functions:
//   ice    plates of snow crystal grown by the cellular automaton of Reiter
//          (2005), src/forms/snowflakes/model.js, seen at three moments;
//   plant  bushes written by a stochastic L-system of Prusinkiewicz and
//          Lindenmayer (1990), src/forms/plants/lsystem.js, derived 3, 5, 7 times;
//   fire   flames: tapered tongues along the back, merged by a smooth
//          union, in a space warped sideways by fractal Brownian motion of
//          value noise that rises with the height (domain warping, after
//          Perlin 1985 and Quilez), with more octaves at each stage;
//   rock   clusters of Voronoi polyhedra (the cells of random seeds cut by
//          the planes of a faceted cap), standing out of the body, more
//          seeds at each stage;
//   water  sails cut from a triply periodic minimal surface (gyroid, Schwarz
//          P or D, Neovius: src/forms/minimal-surfaces/model.js), thickened.
// Everything is one implicit function, negative inside, so that the screen
// and src/print mesh one closed solid. A seed and a type give the monster; its
// three stages (1 the young, 3 the adult) grow the body and the parameters of
// the type. Units as in the biomorphs (about 10 per body radius), x forward,
// z up, the ground at z = 0. No DOM: solid(o) runs in a worker.

import { implicitSolid, onBed } from '../../print/index.js';
import { GENES, develop, field, colours, fromSeed, rng, hash } from '../biomorphs/model.js';
import { simulate } from '../snowflakes/model.js';
import { parse, derive, turtle, radii } from '../plants/lsystem.js';
import { presets as PLANTS } from '../plants/presets.js';
import { TPMS } from '../minimal-surfaces/model.js';

/* ----------------------------------------------------------------- types -- */

// the order of the circle of advantages: each type beats the next two
export const TYPES = ['water', 'fire', 'ice', 'plant', 'rock'];
export const TYPE = {
  water: { en: 'water', it: 'acqua', math: { en: 'minimal surface', it: 'superficie minima' }, hue: 192, sat: 0.55 },
  fire: { en: 'fire', it: 'fuoco', math: { en: 'fractal noise', it: 'rumore frattale' }, hue: 12, sat: 0.68 },
  ice: { en: 'ice', it: 'ghiaccio', math: { en: 'cellular automaton', it: 'automa cellulare' }, hue: 212, sat: 0.45 },
  plant: { en: 'plant', it: 'pianta', math: { en: 'L-system', it: 'sistema L' }, hue: 112, sat: 0.45 },
  rock: { en: 'rock', it: 'roccia', math: { en: 'Voronoi cells', it: 'celle di Voronoi' }, hue: 32, sat: 0.18 },
};
// the two types that a type beats
export const beats = type => { const i = TYPES.indexOf(type); return [TYPES[(i + 1) % 5], TYPES[(i + 2) % 5]]; };

const G = Object.fromEntries(GENES.map((g, i) => [g.k, i]));

// the body genome of a monster: the genes of a biomorph from the seed, with
// arms, spikes and horns taken out (the parts of the type stand in their
// place), legs for every type but water, and a tail curled upwards for fire
export function genome(seed, type) {
  const g = fromSeed(seed);
  g[G.arms] &= 3; g[G.spikes] &= 3; g[G.horn] &= 3;
  if (type !== 'water') g[G.legs] = Math.max(g[G.legs], 4);
  if (type === 'fire') { g[G.tail] = Math.max(g[G.tail], 8); g[G.curl] = 2 * Math.min(2, g[G.curl] >> 1); }
  if (type === 'plant' || type === 'ice') g[G.posture] = Math.min(g[G.posture], 9);
  return g;
}

// the parameters of the type, from the seed
export function typeParams(seed, type) {
  const r = rng(hash(type + ':' + seed)); r();
  const p = { mirror: r() < 0.7 };
  if (type === 'ice') {
    const kinds = [['sectored', 1.6, 0.35, 0.004], ['stellar', 1, 0.3, 0.01], ['broad', 1.2, 0.32, 0.02]];
    const [kind, alpha, beta, gamma] = kinds[Math.floor(r() * kinds.length)];
    Object.assign(p, { kind, alpha, beta: +(beta + 0.04 * r()).toFixed(3), gamma: +(gamma * (0.7 + 0.6 * r())).toFixed(4) });
  } else if (type === 'plant') {
    Object.assign(p, { lseed: 1 + Math.floor(r() * 9999), delta: 30 + Math.round(r() * 16) });
  } else if (type === 'fire') {
    Object.assign(p, { warp: +(0.35 + 0.4 * r()).toFixed(2), freq: +(0.16 + 0.1 * r()).toFixed(3), off: Math.floor(r() * 1000) });
  } else if (type === 'rock') {
    Object.assign(p, { gap: +(0.1 + 0.06 * r()).toFixed(3), cseed: Math.floor(r() * 1e6) });
  } else if (type === 'water') {
    const s = ['gyroid', 'schwarz-p', 'schwarz-d', 'neovius'];
    Object.assign(p, { surface: s[Math.floor(r() * 4)], period: +(0.6 + 0.25 * r()).toFixed(2), phase: [r(), r(), r()].map(v => +(v * 6.28).toFixed(2)) });
  }
  return p;
}

/* --------------------------------------------------------- small vectors -- */

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const FAR = 1e3;

// the places of a developed body where the parts of a type go
function anchors(c) {
  const segs = c.P.filter(p => p.t === 1 && p.tag === 'body');
  const head = c.P.find(p => p.t === 1 && p.tag === 'head');
  const mid = segs[Math.floor((segs.length - 1) / 2)], front = segs[segs.length - 1];
  let tail = null;
  for (const p of c.P) if (p.t === 2 && p.tag === 'body' && (!tail || p.b[0] < tail.b[0])) tail = p;
  const top = q => add(q.c, mul(q.w, q.cc));
  return { mid, front, head, tail, back: top(mid), r: mid.b, hr: head.cc, headTop: add(head.c, [0, 0, head.cc]) };
}

/* -------------------------------------------------------------- ice ----- */

const iceCache = new Map();
function iceSim(p) {
  const key = [p.alpha, p.beta, p.gamma].join();
  if (!iceCache.has(key)) {
    const sim = simulate({ alpha: p.alpha, beta: p.beta, gamma: p.gamma, weather: false, R: 22, maxSteps: 12000 }, null);
    const S3 = Math.sqrt(3), cells = [];
    for (let r = -sim.R; r <= sim.R; r++) for (let q = -sim.R; q <= sim.R; q++) {
      const a = sim.age[(r + sim.R) * sim.W + (q + sim.R)];
      if (a >= 0) cells.push([q + r / 2, r * S3 / 2, a]);
    }
    // the moment at which the crystal reaches a fraction of its final radius
    const when = fr => { let t = Infinity; for (const [x, y, a] of cells) if (Math.hypot(x, y) >= fr * sim.radius - 0.5) t = Math.min(t, a); return t; };
    iceCache.set(key, { cells, radius: sim.radius, steps: sim.steps, T: [when(0.3), when(0.62), Infinity] });
    if (iceCache.size > 8) iceCache.delete(iceCache.keys().next().value);
  }
  return iceCache.get(key);
}

// the signed distance, in cells, of the crystal frozen by time T, on a raster
function crystalRaster(ice, T) {
  const ps = 0.3, Rc = ice.radius + 2, n = Math.ceil(2 * Rc / ps) + 1, on = new Uint8Array(n * n);
  for (const [x, y, a] of ice.cells) {
    if (a > T) continue;
    const cx = (x + Rc) / ps, cy = (y + Rc) / ps, rr = 0.62 / ps;
    for (let j = Math.floor(cy - rr); j <= Math.ceil(cy + rr); j++) for (let i = Math.floor(cx - rr); i <= Math.ceil(cx + rr); i++)
      if (i >= 0 && j >= 0 && i < n && j < n && Math.hypot(i - cx, j - cy) <= rr) on[j * n + i] = 1;
  }
  // chamfer distances (weights 1 and sqrt 2) outside and inside, in pixels
  const chamfer = inside => {
    const d = new Float32Array(n * n), D2 = Math.SQRT2;
    for (let i = 0; i < n * n; i++) d[i] = (on[i] === (inside ? 0 : 1)) ? 0 : 1e6;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = j * n + i; let v = d[o];
      if (i > 0) v = Math.min(v, d[o - 1] + 1);
      if (j > 0) { v = Math.min(v, d[o - n] + 1); if (i > 0) v = Math.min(v, d[o - n - 1] + D2); if (i < n - 1) v = Math.min(v, d[o - n + 1] + D2); }
      d[o] = v;
    }
    for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
      const o = j * n + i; let v = d[o];
      if (i < n - 1) v = Math.min(v, d[o + 1] + 1);
      if (j < n - 1) { v = Math.min(v, d[o + n] + 1); if (i < n - 1) v = Math.min(v, d[o + n + 1] + D2); if (i > 0) v = Math.min(v, d[o + n - 1] + D2); }
      d[o] = v;
    }
    return d;
  };
  const dout = chamfer(false), din = chamfer(true), D = new Float32Array(n * n);
  for (let i = 0; i < D.length; i++) D[i] = (on[i] ? -(din[i] - 0.5) : dout[i] - 0.5) * ps;
  return { D, n, ps, Rc };
}
function rasterAt(R, x, y) {
  const fx = (x + R.Rc) / R.ps, fy = (y + R.Rc) / R.ps, i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= R.n - 1 || j >= R.n - 1) return Math.max(Math.abs(x), Math.abs(y)) - R.Rc + 1;
  const u = fx - i, v = fy - j, o = j * R.n + i, D = R.D;
  return (D[o] * (1 - u) + D[o + 1] * u) * (1 - v) + (D[o + R.n] * (1 - u) + D[o + R.n + 1] * u) * v;
}

function iceParts(c, A, s, p) {
  const ice = iceSim(p), si = clamp(Math.round(s), 1, 3);
  const k = A.r * 1.3 / ice.radius, thick = A.r * 0.085, dil = 0.25 * A.r / 10;
  const plates = [];
  // a plate along the back (its plane x z), and from stage 2 a smaller one
  // over the head facing forward (its plane y z)
  const R1 = crystalRaster(ice, ice.T[si - 1]);
  const rad1 = ice.radius * [0.3, 0.62, 1][si - 1] * k;
  const tilt = p.mirror ? 0 : 0.42;
  plates.push({ R: R1, k, c: add(A.back, [0, 0, rad1 * 0.62]), e1: [Math.cos(tilt), Math.sin(tilt), 0], e2: [0, 0, 1], n: [-Math.sin(tilt), Math.cos(tilt), 0], rad: rad1 });
  if (si >= 2) {
    const R2 = crystalRaster(ice, ice.T[si - 2]), k2 = k * 0.62, rad2 = ice.radius * [0.3, 0.62][si - 2] * k2;
    plates.push({ R: R2, k: k2, c: add(A.headTop, [0, 0, rad2 * 0.55]), e1: [0, 1, 0], e2: [0, 0, 1], n: [1, 0, 0], rad: rad2 });
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const q of plates) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q.c[a] - q.rad - 2); hi[a] = Math.max(hi[a], q.c[a] + q.rad + 2); }
  const f = (x, y, z) => {
    if (x < lo[0] || y < lo[1] || z < lo[2] || x > hi[0] || y > hi[1] || z > hi[2]) return FAR;
    let v = FAR;
    for (const q of plates) {
      const d = [x - q.c[0], y - q.c[1], z - q.c[2]];
      const u = dot(d, q.e1) / q.k, w = dot(d, q.e2) / q.k, nn = Math.abs(dot(d, q.n));
      v = Math.min(v, Math.max(rasterAt(q.R, u, w) * q.k - dil, nn - thick));
    }
    return v;
  };
  return { f, lo, hi, col: () => [0.9, 0.97, 1], info: { steps: ice.steps, radius: Math.round(ice.radius) } };
}

/* ------------------------------------------------------------ plant ----- */

const plantCache = new Map();
function bush(p, n) {
  const key = p.lseed + ':' + p.delta + ':' + n;
  if (!plantCache.has(key)) {
    const P = PLANTS.shrub, sys = parse(P.text, p.delta);
    const { segs } = turtle(derive(sys, n, p.lseed).word, { delta: p.delta, tropism: P.tropism });
    radii(segs, 1, 3);
    let top = 1e-9;
    for (const sg of segs) top = Math.max(top, sg.b[2]);
    plantCache.set(key, { segs, top });
  }
  return plantCache.get(key);
}

// the bushes become round cones and leaves in the body's own list, so that
// the smooth union of the biomorphs joins them
function plantParts(c, A, s, p) {
  const si = clamp(Math.round(s), 1, 3), n = [3, 5, 7][si - 1], { segs, top } = bush(p, n);
  const H = A.r * (0.8 + 0.55 * s), sc = H / top, tip = Math.max(0.7, A.r * 0.06);
  const put = (base, lean, roll, flipY) => {
    const cl = Math.cos(lean), sl = Math.sin(lean), cr = Math.cos(roll), sr = Math.sin(roll);
    const T = q => {
      // roll about z, lean about x (towards +y), scale, move, mirror
      let x = q[0] * cr - q[1] * sr, y = q[0] * sr + q[1] * cr, z = q[2];
      [y, z] = [y * cl + z * sl, -y * sl + z * cl];
      const v = add(base, [x * sc, y * sc, z * sc]);
      if (flipY) v[1] = -v[1];
      return v;
    };
    for (const sg of segs) {
      const r0 = tip * Math.pow(sg.w, 1 / 3), r1 = sg.tip ? tip : tip * Math.pow(Math.max(1, sg.w - 1), 1 / 3);
      c.P.push({ t: 2, a: T(sg.a), b: T(sg.b), r1: r0, r2: Math.min(r0, r1), k: tip * 0.6, tag: 'type' });
      if (sg.tip) c.P.push({ t: 0, c: T(sg.b), r: tip * 1.6, k: tip * 0.4, tag: 'leaf' });
    }
  };
  if (p.mirror) {
    const base = add(add(A.front.c, mul(A.front.v, A.front.b * 0.5)), mul(A.front.w, A.front.cc * 0.55));
    put(base, 0.35, 0, false); put(base, 0.35, 0, true);
  } else put(sub(A.back, [0, 0, A.r * 0.3]), 0, p.lseed % 7, false);
  return { info: { n, segments: segs.length } };
}

/* ------------------------------------------------------------- fire ----- */

// value noise in [-1, 1] on the integer lattice, smoothly interpolated, and
// its fractal sum (fBm) over `oct` octaves of doubling frequency
function lat(i, j, k) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}
function vnoise(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const u = x - i, v = y - j, w = z - k;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), sw = w * w * (3 - 2 * w);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(lat(i, j, k), lat(i + 1, j, k), su), l(lat(i, j + 1, k), lat(i + 1, j + 1, k), su), sv),
    l(l(lat(i, j, k + 1), lat(i + 1, j, k + 1), su), l(lat(i, j + 1, k + 1), lat(i + 1, j + 1, k + 1), su), sv), sw);
}
export function fbm(x, y, z, oct) {
  let v = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { v += a * vnoise(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
  return v;
}

// the tops of the segments of the body, from the tail to the head
const ridge = c => c.P.filter(q => q.t === 1 && q.tag === 'body').sort((u, v) => u.c[0] - v.c[0]).map(q => add(q.c, mul(q.w, q.cc * 0.8)));

// a flame: a tongue from a to b that keeps its width r1 low down and then
// closes to a pointed tip of radius r2 (the radius never grows upwards, so
// the sides never face down)
const tongue = (q, a, b, r1, r2) => {
  const e = sub(b, a), w = sub(q, a), t = clamp(dot(w, e) / dot(e, e), 0, 1);
  return len(sub(w, mul(e, t))) - (r2 + (r1 - r2) * (1 - t ** 1.6));
};

function fireParts(c, A, s, p) {
  const oct = 1 + Math.round(clamp(s, 1, 3)), r = A.r, R = rng(p.off + 11);
  const tongues = [];
  // a fire: n tongues on a line from p0 to p1, the tallest in the middle,
  // leaning backwards as if the monster ran
  const fire = (p0, p1, n, H, w) => {
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1), a = add(mul(p0, 1 - u), mul(p1, u));
      const h = H * (0.6 + 0.4 * Math.sin(Math.PI * u)) * (0.85 + 0.3 * R()), dy = (R() - 0.5) * w * 0.8;
      a[1] += dy;
      tongues.push({ a, b: add(a, [-h * 0.25, dy * 0.6, h]), r1: w * (0.8 + 0.3 * R()), r2: Math.max(w * 0.14, 0.65), h });
    }
  };
  let top = ridge(c);
  if (top.length < 2) top = [add(A.back, [-r * 0.7, 0, -r * 0.15]), add(A.back, [r * 0.4, 0, 0])];
  const n = Math.max(2, Math.round(1 + 1.6 * s));
  fire(sub(top[0], [0, 0, r * 0.25]), sub(top[top.length - 1], [0, 0, r * 0.25]), n, r * (0.75 + 0.5 * s), r * 0.42);
  fire(sub(A.headTop, [A.hr * 0.1, 0, A.hr * 0.3]), sub(A.headTop, [A.hr * 0.1, 0, A.hr * 0.3]), 1, A.hr * (0.9 + 0.5 * s), A.hr * 0.5);
  if (A.tail) fire(sub(A.tail.b, [0, 0, r * 0.1]), sub(A.tail.b, [0, 0, r * 0.1]), 1, r * (0.8 + 0.45 * s), Math.max(A.tail.r2 * 1.8, r * 0.36));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const q of tongues) for (const v of [q.a, q.b]) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], v[a] - q.r1 - r * 0.5); hi[a] = Math.max(hi[a], v[a] + q.r1 + r * 0.5);
  }
  if (p.mirror) { lo[1] = Math.min(lo[1], -hi[1]); hi[1] = Math.max(hi[1], -lo[1]); }
  // the space warped sideways by two fBm fields whose argument rises with
  // the height (domain warping along the vertical), more towards the tips;
  // the tongues joined by a smooth union so that they merge at the bottom
  const fq = p.freq * 6 / r, W = p.warp * r * 1.2, o = p.off, k = r * 0.35;
  const f = (x, y0, z) => {
    if (x < lo[0] || y0 < lo[1] || z < lo[2] || x > hi[0] || y0 > hi[1] || z > hi[2]) return FAR;
    const y = p.mirror ? Math.abs(y0) : y0;
    const X = x * fq, Y = y * fq, Z = z * fq * 0.6;
    const wx = fbm(X + o, Y, Z - o * 0.37, oct), wy = fbm(X, Y + o + 17.3, Z - o * 0.37, oct);
    let v = FAR;
    for (const q of tongues) {
      const hf = clamp((z - q.a[2]) / q.h, 0, 1), g = W * hf * hf;
      v = smin(v, tongue([x + g * wx, y + g * wy, z], q.a, q.b, q.r1, q.r2), k);
    }
    return v;
  };
  // red at the root, yellow at the tips
  const col = (x, y, z) => {
    let best = Infinity, t = 0;
    for (const q of tongues) {
      const d = tongue([x, p.mirror ? Math.abs(y) : y, z], q.a, q.b, q.r1, q.r2);
      if (d < best) { best = d; t = clamp((z - q.a[2]) / q.h, 0, 1); }
    }
    return [lerp(0.9, 1, t), lerp(0.2, 0.8, t), lerp(0.05, 0.16, t)];
  };
  return { f, lo, hi, col, info: { octaves: oct, flames: tongues.length } };
}

/* ------------------------------------------------------------- rock ----- */

function rockParts(c, A, s, p) {
  const r = A.r, R = rng(p.cseed + 7), K = 2 + 2 * Math.round(clamp(s, 1, 3));
  const clusters = [];
  // a cluster: k seeds in the upper half of a ball around cen, each cell cut
  // by its bisecting planes (less half the gap) and by the planes of a cap
  // facing away from cen, so that every stone is a convex polyhedron with
  // large flat facets
  const cluster = (cen, Rb, k) => {
    const seeds = [];
    for (let i = 0; i < k; i++) {
      let v;
      do v = [2 * R() - 1, 2 * R() - 1, 2 * R() - 1]; while (len(v) > 1 || len(v) < 0.35);
      v[2] = Math.abs(v[2]) * 0.8 + 0.15;
      const q = add(cen, mul(v, Rb * 0.75)), d = norm(sub(q, cen)), e = Rb * (0.3 + 0.25 * R());
      // the cap: a plane across d and three planes tilted by 40 degrees
      // around it, so that the top of the stone is a blunt pyramid
      const u = norm(Math.abs(d[2]) < 0.9 ? [d[1], -d[0], 0] : [1, 0, 0]), w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
      const caps = [{ n: d, e }], ph = 6.283 * R();
      for (let j = 0; j < 3; j++) {
        const a = ph + 2.094 * j;
        caps.push({ n: norm(add(mul(d, 0.766), add(mul(u, 0.643 * Math.cos(a)), mul(w, 0.643 * Math.sin(a))))), e: e * (0.82 + 0.12 * R()) });
      }
      seeds.push({ p: q, caps, shade: R() });
    }
    const pairs = seeds.map((a, i) => seeds.map((b, j) => (i === j ? null : { m: mul(add(a.p, b.p), 0.5), n: norm(sub(b.p, a.p)) })));
    clusters.push({ c: cen, Rb, seeds, pairs });
  };
  // the clusters stand out of the back, the shoulders and, at the last
  // stage, the head
  const Rb = r * (0.55 + 0.2 * s);
  if (p.mirror) {
    cluster(add(A.back, [0, 0, Rb * 0.45]), Rb, K);
    cluster(add(add(A.front.c, mul(A.front.v, A.front.b * 0.62)), mul(A.front.w, A.front.cc * 0.55)), Rb * 0.72, Math.max(3, K - 2));
  } else {
    cluster(add(A.back, [-r * 0.2, r * 0.25, Rb * 0.45]), Rb, K);
    cluster(add(add(A.front.c, mul(A.front.v, A.front.b * 0.6)), mul(A.front.w, A.front.cc * 0.6)), Rb * 0.7, Math.max(3, K - 2));
  }
  if (s > 2.5) cluster(add(A.headTop, [-A.hr * 0.2, 0, A.hr * 0.05]), A.hr * 0.6, 4);
  const gap = p.gap * r;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const cl of clusters) for (let a = 0; a < 3; a++) {
    const e = cl.Rb * 1.7;
    lo[a] = Math.min(lo[a], cl.c[a] - e, a === 1 && p.mirror ? -cl.c[a] - e : Infinity); hi[a] = Math.max(hi[a], cl.c[a] + e, a === 1 && p.mirror ? -cl.c[a] + e : -Infinity);
  }
  // the stone of q: its cluster, its seed and how far q is from the nearest
  // other cell (small along the edges between the stones)
  const cell = q => {
    let out = null;
    for (const cl of clusters) {
      const dc = len(sub(q, cl.c)) - cl.Rb * 1.6;
      let i = 0, best = Infinity, second = Infinity;
      cl.seeds.forEach((sd, j) => { const d = len(sub(q, sd.p)); if (d < best) { second = best; best = d; i = j; } else if (d < second) second = d; });
      if (!out || dc < out.dc) out = { cl, i, dc, edge: second - best };
    }
    return out;
  };
  const f = (x, y0, z) => {
    if (x < lo[0] || y0 < lo[1] || z < lo[2] || x > hi[0] || y0 > hi[1] || z > hi[2]) return FAR;
    const q = [x, p.mirror ? Math.abs(y0) : y0, z];
    let v = FAR;
    for (const cl of clusters) {
      const dc = len(sub(q, cl.c)) - cl.Rb * 1.6;
      if (dc > 1) { v = Math.min(v, dc); continue; }
      let i = 0, best = Infinity;
      cl.seeds.forEach((sd, j) => { const d = len(sub(q, sd.p)); if (d < best) { best = d; i = j; } });
      const sd = cl.seeds[i], w = sub(q, sd.p);
      let d = dc;
      for (const cp of sd.caps) d = Math.max(d, dot(w, cp.n) - cp.e);
      for (const pr of cl.pairs[i]) if (pr) d = Math.max(d, dot(sub(q, pr.m), pr.n) + gap / 2);
      v = Math.min(v, d);
    }
    return v;
  };
  // slate, darker than the body, a different shade on every stone and on
  // every facet of its cap, the edges between the stones darker still
  const col = (x, y, z) => {
    const q = [x, p.mirror ? Math.abs(y) : y, z], { cl, i, edge } = cell(q), sd = cl.seeds[i], w = sub(q, sd.p);
    let face = 0, best = -Infinity;
    sd.caps.forEach((cp, j) => { const d = dot(w, cp.n) - cp.e; if (d > best) { best = d; face = j; } });
    const g = 0.17 + 0.12 * sd.shade + 0.05 * ((face * 5 + i) % 3), e = clamp(edge / (gap * 2.5), 0, 1);
    const l = g * (0.6 + 0.4 * e);
    return [l * 0.9, l * 0.98, l * 1.18];
  };
  return { f, lo, hi, col, info: { seeds: clusters.reduce((t, cl) => t + cl.seeds.length, 0), clusters: clusters.length } };
}

/* ------------------------------------------------------------ water ----- */

// an ellipsoid with axes along x, y, z (close to a distance)
const ellip = (q, c, a, b, cc) => {
  const lx = (q[0] - c[0]) / a, ly = (q[1] - c[1]) / b, lz = (q[2] - c[2]) / cc;
  const k0 = Math.hypot(lx, ly, lz), k1 = Math.hypot(lx / a, ly / b, lz / cc);
  return k1 > 1e-12 ? k0 * (k0 - 1) / k1 : -Math.min(a, b, cc);
};

function waterParts(c, A, s, p) {
  const r = A.r, F = TPMS[p.surface], om = 2 * Math.PI / (r * p.period), th = r * 0.055 + 0.25;
  const sails = [{ c: add(A.back, [-r * 0.1, 0, r * (0.25 + 0.2 * s)]), a: r * (0.75 + 0.3 * s), b: r * 0.42, cc: r * (0.4 + 0.3 * s) }];
  if (s > 1.5) sails.push({ c: add(A.headTop, [-A.hr * 0.25, 0, A.hr * 0.2 * s]), a: A.hr * 0.7, b: A.hr * 0.36, cc: A.hr * (0.25 + 0.2 * s) });
  if (s > 2.5 && A.tail) sails.push({ c: A.tail.b, a: r * 0.55, b: r * 0.32, cc: r * 0.75 });
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const q of sails) {
    const e = [q.a, q.b, q.cc];
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q.c[a] - e[a] - 2); hi[a] = Math.max(hi[a], q.c[a] + e[a] + 2); }
  }
  const [p0, p1, p2] = p.phase;
  const f = (x, y0, z) => {
    if (x < lo[0] || y0 < lo[1] || z < lo[2] || x > hi[0] || y0 > hi[1] || z > hi[2]) return FAR;
    const q = [x, p.mirror ? Math.abs(y0) : y0, z];
    let e = FAR;
    for (const sl of sails) e = Math.min(e, ellip(q, sl.c, sl.a, sl.b, sl.cc));
    if (e > 1.5) return e;
    const [v, gx, gy, gz] = F(q[0] * om + p0, q[1] * om + p1, q[2] * om + p2);
    const sheet = Math.abs(v) / (om * Math.max(0.3, Math.hypot(gx, gy, gz))) - th;
    return Math.max(e, sheet);
  };
  return { f, lo, hi, col: () => [0.82, 0.95, 0.98], info: { surface: p.surface, sails: sails.length } };
}

const PARTS = { ice: iceParts, plant: plantParts, fire: fireParts, rock: rockParts, water: waterParts };

/* ------------------------------------------------------------ colours ----- */

const hsl = (h, s, l) => {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const t = x => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  return [t(h + 1 / 3), t(h), t(h - 1 / 3)];
};
export function palette(seed, type) {
  const T = TYPE[type], r = rng(hash('hue' + seed)), h = T.hue + (r() - 0.5) * 24, s = T.sat;
  const acc = type === 'plant' ? hsl(h - 70, 0.6, 0.62) : hsl(h + 18, Math.min(0.8, s + 0.15), 0.46);
  return {
    body: hsl(h, s, 0.58), head: hsl(h, s, 0.6), ear: hsl(h, s, 0.6), limb: hsl(h, s * 0.9, 0.5),
    accent: acc, foot: hsl(h, s * 0.8, 0.4), belly: hsl(h + 8, s * 0.8, 0.84), inner: hsl(345, 0.5, 0.78),
    eye: [0.98, 0.97, 0.99], pupil: [0.06, 0.04, 0.1], mouth: [0.25, 0.1, 0.2], shine: [1, 1, 1], cheek: hsl(h - 20, 0.6, 0.72),
    spot: acc, type: hsl(type === 'plant' ? 28 : h, 0.4, 0.38), leaf: hsl(type === 'plant' ? 100 + r() * 40 : h, 0.55, 0.45),
    css: `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% 58%)`, cssAccent: `hsl(${(h + 18).toFixed(0)} ${Math.min(80, s * 100 + 15).toFixed(0)}% 46%)`,
  };
}

/* ------------------------------------------------------------ the monster -- */

// the monster of a seed and type at stage s (1 to 3, a fraction while it
// grows): its field f, box, body field, type part and what the card tells
export function monster(seed, type, s = 3) {
  const g = genome(seed, type), p = typeParams(seed, type);
  const c = develop(g, s), A = anchors(c);
  const T = PARTS[type](c, A, s, p);
  const F = field([c]);
  const k = Math.min(A.r * 0.16, F.hi[0] - F.lo[0]);
  const f = T.f ? (x, y, z) => smin(F.f(x, y, z), T.f(x, y, z), k) : F.f;
  const lo = F.lo.slice(), hi = F.hi.slice();
  if (T.f) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], T.lo[a]); hi[a] = Math.max(hi[a], T.hi[a]); }
  // the real top, on a coarse grid (the boxes of the parts are padded)
  let top = 0;
  const n = 36, dx = (hi[0] - lo[0]) / n, dy = (hi[1] - lo[1]) / n, dz = (hi[2] - lo[2]) / (2 * n);
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) for (let kk = 2 * n; kk >= 0; kk--) {
    const z = lo[2] + kk * dz;
    if (z <= top) break;
    if (f(lo[0] + i * dx, lo[1] + j * dy, z) < 0) { top = z; break; }
  }
  hi[2] = Math.min(hi[2], top + dz);
  return { seed, type, s, g, p, c, F, T, f, lo, hi, top, info: T.info };
}

// the field moved by d
const moved = (m, d) => ({ ...m, f: (x, y, z) => m.f(x - d[0], y - d[1], z - d[2]), lo: add(m.lo, d), hi: add(m.hi, d), d });

// one stage, or the three side by side (stage 1 on the left of a viewer who
// looks at their faces)
export function lineup(seed, type, stage) {
  if (stage !== 'c') return [moved(monster(seed, type, +stage), [0, 0, 0])];
  let y = 0;
  return [1, 2, 3].map((s, i) => {
    const m = monster(seed, type, s), w = m.hi[1] - m.lo[1];
    if (i > 0) y += w * 0.5 + 3;
    const d = [-(m.lo[0] + m.hi[0]) / 2, y - (m.lo[1] + m.hi[1]) / 2, 0];
    y += w * 0.5 + 3;
    return moved(m, d);
  });
}

// a coloured mesh for the screen, cells across the largest side
export function screenMesh(seed, type, stage, cells = 80) {
  const ms = lineup(seed, type, String(stage));
  const lo = [0, 1, 2].map(a => Math.min(...ms.map(m => m.lo[a]))), hi = [0, 1, 2].map(a => Math.max(...ms.map(m => m.hi[a])));
  lo[2] = Math.max(0, lo[2]);
  const h = Math.max(...[0, 1, 2].map(a => hi[a] - lo[a])) / cells;
  const f = ms.length === 1 ? ms[0].f : (x, y, z) => Math.min(ms[0].f(x, y, z), ms[1].f(x, y, z), ms[2].f(x, y, z));
  const m = implicitSolid((x, y, z) => Math.max(f(x, y, z), -z), [lo, hi], h, { crumbs: 0.02 });
  const pal = palette(seed, type), C = new Float32Array(m.pos.length), P = m.pos;
  for (const mm of ms) {
    const sel = [];
    for (let v = 0; v < P.length; v += 3) {
      const x = P[v] - mm.d[0], y = P[v + 1] - mm.d[1], z = P[v + 2];
      if (x >= mm.lo[0] - 1 - mm.d[0] && x <= mm.hi[0] + 1 - mm.d[0] && y >= mm.lo[1] - 1 - mm.d[1] && y <= mm.hi[1] + 1 - mm.d[1]) sel.push(v);
    }
    const loc = new Float32Array(sel.length * 3);
    sel.forEach((v, i) => { loc[3 * i] = P[v] - mm.d[0]; loc[3 * i + 1] = P[v + 1] - mm.d[1]; loc[3 * i + 2] = P[v + 2]; });
    const cb = colours(mm.F, loc, [pal]);
    sel.forEach((v, i) => {
      let rgb = [cb[3 * i], cb[3 * i + 1], cb[3 * i + 2]];
      if (mm.T.f) {
        const x = loc[3 * i], y = loc[3 * i + 1], z = loc[3 * i + 2], a = mm.F.f(x, y, z), b = mm.T.f(x, y, z);
        const t = clamp(0.5 + (a - b) / (mm.F.hi[2] * 0.02 + 0.4), 0, 1);
        if (t > 0) { const tc = mm.T.col(x, y, z); rgb = rgb.map((u, j) => lerp(u, tc[j], t)); }
      }
      C[v] = rgb[0]; C[v + 1] = rgb[1]; C[v + 2] = rgb[2];
    });
  }
  m.col = C; m.lo = lo; m.hi = hi;
  return m;
}

/* -------------------------------------------------------- the solid, in mm -- */

// o: { seed, type, stage ('1' | '2' | '3' | 'c'), size (mm, height of the
// tallest), base (a rounded plate under the feet, else cut flat), res }
export function solid({ seed = 1, type = 'ice', stage = '3', size = 70, base = true, res = 'draft' } = {}, progress) {
  const ms = lineup(seed, type, String(stage));
  const lo0 = [0, 1, 2].map(a => Math.min(...ms.map(m => m.lo[a]))), hi0 = [0, 1, 2].map(a => Math.max(...ms.map(m => m.hi[a])));
  const k = size / Math.max(...ms.map(m => m.top)), lo = lo0.map(v => v * k), hi = hi0.map(v => v * k);
  const fm = ms.length === 1 ? ms[0].f : (x, y, z) => Math.min(ms[0].f(x, y, z), ms[1].f(x, y, z), ms[2].f(x, y, z));
  const bt = 3, mg = 4, bx0 = lo[0] - mg, bx1 = hi[0] + mg, by0 = lo[1] - mg, by1 = hi[1] + mg;
  const A = (bx1 - bx0) / 2, B = (by1 - by0) / 2, cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, rc = Math.min(A, B) * 0.92, er = 1;
  const plate = (x, y, z) => {
    const qx = Math.abs(x - cx) - (A - rc), qy = Math.abs(y - cy) - (B - rc);
    const d2 = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc + er;
    const dz = Math.abs(z + bt / 2) - bt / 2 + er;
    return Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0) - er;
  };
  const f = base
    ? (x, y, z) => smin(Math.max(fm(x / k, y / k, z / k) * k, -1 - z), plate(x, y, z), 1.6)
    : (x, y, z) => Math.max(fm(x / k, y / k, z / k) * k, -z);
  const h = size / (res === 'fine' ? 130 : 85);
  const b0 = base ? [bx0, by0, -bt] : [lo[0], lo[1], 0], b1 = base ? [bx1, by1, hi[2]] : hi;
  const m = onBed(implicitSolid(f, [b0, b1], h, { progress }));
  m.overhang = overhang(m, base ? bt + 0.5 : 0.5);
  return m;
}

// the share of the area, in percent, that faces down by more than 45 degrees
// above the height z0 (where a printer needs supports)
export function overhang(m, z0) {
  let all = 0, over = 0;
  const p = m.pos, I = m.idx;
  for (let t = 0; t < I.length; t += 3) {
    const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, ar = Math.hypot(nx, ny, nz) / 2;
    all += ar;
    if (nz / (2 * ar || 1) < -0.71 && (p[a + 2] + p[b + 2] + p[c + 2]) / 3 > z0) over += ar;
  }
  return +(100 * over / (all || 1)).toFixed(1);
}

export const fileName = o => `monster_${o.type}_${o.seed}_${o.stage === 'c' ? 'stages' : 'stage' + o.stage}_${o.size}mm${o.base ? '_base' : ''}`;

/* ------------------------------------------------------------- the names -- */

// syllables of no language in particular, a set for each type, joined by
// rules of thumb so that the names can be read aloud
const SYL = {
  water: ['nel', 'so', 'mar', 'li', 'ue', 'ondo', 'pel', 'ri', 'sav', 'ae'],
  fire: ['ka', 'ro', 'ish', 'tem', 'ba', 'vul', 'ar', 'zo', 'fen', 'ki'],
  ice: ['vi', 'nor', 'ske', 'li', 'tal', 'ys', 'fro', 'ka', 'mi', 'el'],
  plant: ['lo', 'ver', 'mo', 'til', 'an', 'fe', 'ru', 'oli', 'ba', 'sel'],
  rock: ['gor', 'du', 'tra', 'm', 'bas', 'ol', 'kar', 'te', 'un', 'gra'],
};
const END = ['ix', 'os', 'ane', 'ul', 'ard', 'eth', 'or', 'ima', 'und', 'era'];
const cap = w => w[0].toUpperCase() + w.slice(1);
const join = (a, b) => (/[aeiouy]$/.test(a) && /^[aeiouy]/.test(b) ? a + 'r' + b : !/[aeiouy]$/.test(a) && !/^[aeiouy]/.test(b) ? a + 'e' + b : a + b);

// three names, one per stage: the young has two syllables, the next three,
// the adult the three and an ending
export function names(seed, type) {
  const r = rng(hash('names:' + type + ':' + seed)), S = SYL[type], pick = () => S[Math.floor(r() * S.length)];
  const a = pick(), b = pick(), c = pick(), e = END[Math.floor(r() * END.length)];
  return [cap(join(a, b)), cap(join(join(a, c), b)), cap(join(join(c, a), e))];
}
export const number = (seed, type) => hash(type + '#' + seed) % 1000;

// Scene E: learning is optimization. The test functions of optiml in two
// dimensions, and its algorithms racing on the same landscape from the same
// start, each with its color, on the level map and on the surface side by
// side, as the contour and the 3D plots of optiml; one iteration index drives
// both, and a click on the map moves the start.

import { proxMax } from './problems/lagrangian2d.js';
import { createSurface, niceTicks, fmt } from './learning3d.js';
import { t as tr, onLang } from './i18n.js';

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- functions
const functions = {
  quadratic: {
    label: 'Ill-conditioned quadratic', it: 'Quadratica mal condizionata', lr: 0.05,
    box: [-4, 4, -4, 4], start: [-3.5, 3], minima: [[0, 0]],
    f: ([x, y]) => 0.5 * (x * x + 12 * y * y) + 0.4 * x * y,
    g: ([x, y]) => [x + 0.4 * y, 12 * y + 0.4 * x],
    h: () => [[1, 0.4], [0.4, 12]],
  },
  rosenbrock: {
    label: 'Rosenbrock', lr: 0.0015,
    box: [-2, 2, -1, 3], start: [-1.5, 2.5], minima: [[1, 1]],
    f: ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
    g: ([x, y]) => [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)],
    h: ([x, y]) => [[2 - 400 * (y - 3 * x * x), -400 * x], [-400 * x, 200]],
    log: true,
  },
  himmelblau: {
    label: 'Himmelblau (four minima)', it: 'Himmelblau (quattro minimi)', lr: 0.01,
    box: [-5, 5, -5, 5], start: [-0.3, -0.8],
    minima: [[3, 2], [-2.805118, 3.131312], [-3.779310, -3.283186], [3.584428, -1.848126]],
    f: ([x, y]) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2,
    g: ([x, y]) => [4 * x * (x * x + y - 11) + 2 * (x + y * y - 7), 2 * (x * x + y - 11) + 4 * y * (x + y * y - 7)],
    h: ([x, y]) => [[12 * x * x + 4 * y - 42, 4 * x + 4 * y], [4 * x + 4 * y, 4 * x + 12 * y * y - 26]],
    log: true,
  },
  nonsmooth: {
    label: 'Nonsmooth: |x| + 3|y| + a ridge', it: 'Non differenziabile: |x| + 3|y| + una cresta', lr: 0.05,
    box: [-4, 4, -4, 4], start: [-3.2, 2.6], minima: [[0, 0]],
    f: ([x, y]) => Math.abs(x) + 3 * Math.abs(y) + Math.max(0, x + y - 1),
    g: ([x, y]) => [Math.sign(x) + (x + y > 1 ? 1 : 0), 3 * Math.sign(y) + (x + y > 1 ? 1 : 0)],
    h: null,
  },
  // the instances of the notebooks of optiml (LineSearchMethods, StochasticMethods)
  optimlQuadratic: {
    label: 'Quadratic of optiml: Q = [[5, -3], [-3, 5]], q = [10, 5]', it: 'Quadratica di optiml: Q = [[5, -3], [-3, 5]], q = [10, 5]', lr: 0.05,
    box: [-5, 2, -5, 2], start: [-1, 1], minima: [[-65 / 16, -55 / 16]],
    f: ([x, y]) => 0.5 * (5 * x * x - 6 * x * y + 5 * y * y) + 10 * x + 5 * y,
    g: ([x, y]) => [5 * x - 3 * y + 10, -3 * x + 5 * y + 5],
    h: () => [[5, -3], [-3, 5]],
  },
  rosenbrock2: {
    label: 'Rosenbrock of optiml (b = 2)', it: 'Rosenbrock di optiml (b = 2)', lr: 0.05,
    box: [-2, 2, -1, 3], start: [-1, 1], minima: [[1, 1]],
    f: ([x, y]) => (1 - x) ** 2 + 2 * (y - x * x) ** 2,
    g: ([x, y]) => [-2 * (1 - x) - 8 * x * (y - x * x), 4 * (y - x * x)],
    h: ([x, y]) => [[2 - 8 * (y - 3 * x * x), -8 * x], [-8 * x, 4]],
  },
  sixhump: {
    label: 'Six-Hump Camel (two global minima, four local)', it: 'Six-Hump Camel (due minimi globali, quattro locali)', lr: 0.02,
    box: [-2, 2, -1, 1], start: [-1, 0], minima: [[0.0898, -0.7126], [-0.0898, 0.7126]],
    f: ([x, y]) => (4 - 2.1 * x * x + x ** 4 / 3) * x * x + x * y + (-4 + 4 * y * y) * y * y,
    g: ([x, y]) => [8 * x - 8.4 * x ** 3 + 2 * x ** 5 + y, x - 8 * y + 16 * y ** 3],
    h: ([x, y]) => [[8 - 25.2 * x * x + 10 * x ** 4, 1], [1, -8 + 48 * y * y]],
  },
  ackley: {
    label: 'Ackley (many local minima around a deep hole)', it: 'Ackley (molti minimi locali attorno a una buca profonda)', lr: 0.02,
    box: [-4, 4, -4, 4], start: [2.6, 2.2], minima: [[0, 0]],
    f: ([x, y]) => -20 * Math.exp(-0.2 * Math.sqrt((x * x + y * y) / 2)) - Math.exp((Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * y)) / 2) + Math.E + 20,
    g: ([x, y]) => {
      const r = Math.sqrt((x * x + y * y) / 2) || 1e-12, a = 2 * Math.exp(-0.2 * r) / r, c = Math.PI * Math.exp((Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * y)) / 2);
      return [a * x + c * Math.sin(2 * Math.PI * x), a * y + c * Math.sin(2 * Math.PI * y)];
    },
  },
  leastsquares: {
    label: 'Least squares: a linear model on correlated features', it: 'Minimi quadrati: un modello lineare su feature correlate', lr: 0.05,
    box: [7, 23, -25, -9], start: [8, -10], minima: [[15, -17]],
    f: ([x, y]) => { const u = x - 15, v = y + 17; return 0.5 * (2 * u * u + 3.2 * u * v + 2 * v * v); },
    g: ([x, y]) => { const u = x - 15, v = y + 17; return [2 * u + 1.6 * v, 1.6 * u + 2 * v]; },
    h: () => [[2, 1.6], [1.6, 2]],
  },
  ridge: {
    label: 'Least squares with L2 (ridge)', it: 'Minimi quadrati con L2 (ridge)', lr: 0.05,
    box: [-10, 10, -10, 10], start: [7, 9], minima: [[9.76 / 8.0025, -3.82 / 8.0025]],
    // 0.5 (w - w*)' A (w - w*) + 0.5 lambda |w|^2, w* = (4, -3), A as above, lambda = 1.25
    f: ([x, y]) => { const u = x - 4, v = y + 3; return 0.5 * (2 * u * u + 3.2 * u * v + 2 * v * v) + 0.625 * (x * x + y * y); },
    g: ([x, y]) => { const u = x - 4, v = y + 3; return [2 * u + 1.6 * v + 1.25 * x, 1.6 * u + 2 * v + 1.25 * y]; },
    h: () => [[3.25, 1.6], [1.6, 3.25]],
  },
  // classics of the literature
  beale: {
    label: 'Beale (flat valleys, steep walls)', it: 'Beale (valli piatte, pareti ripide)', lr: 0.002,
    box: [-4.5, 4.5, -4.5, 4.5], start: [1, 1.5], minima: [[3, 0.5]],
    f: ([x, y]) => (1.5 - x + x * y) ** 2 + (2.25 - x + x * y * y) ** 2 + (2.625 - x + x * y ** 3) ** 2,
    g: ([x, y]) => {
      const a = 1.5 - x + x * y, b = 2.25 - x + x * y * y, c = 2.625 - x + x * y ** 3;
      return [2 * a * (y - 1) + 2 * b * (y * y - 1) + 2 * c * (y ** 3 - 1), 2 * a * x + 4 * b * x * y + 6 * c * x * y * y];
    },
    log: true,
  },
  rastrigin: {
    label: 'Rastrigin (a regular grid of local minima)', it: 'Rastrigin (una griglia regolare di minimi locali)', lr: 0.002,
    box: [-5.12, 5.12, -5.12, 5.12], start: [3.3, -2.7], minima: [[0, 0]],
    f: ([x, y]) => 20 + x * x - 10 * Math.cos(2 * Math.PI * x) + y * y - 10 * Math.cos(2 * Math.PI * y),
    g: ([x, y]) => [2 * x + 20 * Math.PI * Math.sin(2 * Math.PI * x), 2 * y + 20 * Math.PI * Math.sin(2 * Math.PI * y)],
    h: ([x, y]) => [[2 + 40 * Math.PI ** 2 * Math.cos(2 * Math.PI * x), 0], [0, 2 + 40 * Math.PI ** 2 * Math.cos(2 * Math.PI * y)]],
  },
  styblinski: {
    label: 'Styblinski-Tang (four basins of different depth)', it: 'Styblinski-Tang (quattro bacini di diversa profondità)', lr: 0.01,
    box: [-5, 5, -5, 5], start: [4.5, 4.2], minima: [[-2.903534, -2.903534]],
    f: ([x, y]) => 0.5 * (x ** 4 - 16 * x * x + 5 * x + y ** 4 - 16 * y * y + 5 * y),
    g: ([x, y]) => [0.5 * (4 * x ** 3 - 32 * x + 5), 0.5 * (4 * y ** 3 - 32 * y + 5)],
    h: ([x, y]) => [[6 * x * x - 16, 0], [0, 6 * y * y - 16]],
  },
  goldstein: {
    label: 'Goldstein-Price (values from 3 to millions)', it: 'Goldstein-Price (valori da 3 a milioni)', lr: 0.00002,
    box: [-2, 2, -2, 2], start: [1, -0.5], minima: [[0, -1]],
    f: ([x, y]) => (1 + (x + y + 1) ** 2 * (19 - 14 * x + 3 * x * x - 14 * y + 6 * x * y + 3 * y * y))
      * (30 + (2 * x - 3 * y) ** 2 * (18 - 32 * x + 12 * x * x + 48 * y - 36 * x * y + 27 * y * y)),
    log: true,
  },
};

// the gradient by central differences where it is not written, and the
// Hessian by central differences of the gradient where only the gradient is
// (nonsmooth functions keep h: null, so Newton and BFGS are left out on them)
for (const F of Object.values(functions)) {
  const e = 1e-5;
  if (!F.g) F.g = ([x, y]) => [(F.f([x + e, y]) - F.f([x - e, y])) / (2 * e), (F.f([x, y + e]) - F.f([x, y - e])) / (2 * e)];
  if (F.h === undefined) F.h = ([x, y]) => {
    const gx1 = F.g([x + e, y]), gx0 = F.g([x - e, y]), gy1 = F.g([x, y + e]), gy0 = F.g([x, y - e]);
    const a = (gx1[0] - gx0[0]) / (2 * e), b = (gx1[1] - gx0[1] + gy1[0] - gy0[0]) / (4 * e), d = (gy1[1] - gy0[1]) / (2 * e);
    return [[a, b], [b, d]];
  };
}

// --------------------------------------------------------------- algorithms
// each: step(F, s, p) moves the state s, whose point is s.x; the colours are
// in the palette below, one for the light theme and one for the dark
const add = (a, b, t = 1) => [a[0] + t * b[0], a[1] + t * b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const algorithms = {
  gd: { name: 'Gradient descent', it: 'Discesa del gradiente',
    step: (F, s, p) => { s.x = add(s.x, F.g(s.x), -p.lr); } },
  polyak: { name: 'Momentum (Polyak)', it: 'Momento (Polyak)',
    step: (F, s, p) => { s.v = add([0.9 * (s.v?.[0] ?? 0), 0.9 * (s.v?.[1] ?? 0)], F.g(s.x), -p.lr); s.x = add(s.x, s.v); } },
  nesterov: { name: 'Nesterov',
    step: (F, s, p) => { const v = s.v ?? [0, 0], look = add(s.x, v, 0.9); s.v = add([0.9 * v[0], 0.9 * v[1]], F.g(look), -p.lr); s.x = add(s.x, s.v); } },
  adagrad: { name: 'AdaGrad',
    step: (F, s, p) => { const g = F.g(s.x); s.G = add(s.G ?? [0, 0], [g[0] * g[0], g[1] * g[1]]); s.x = [s.x[0] - p.lr * 20 * g[0] / (Math.sqrt(s.G[0]) + 1e-8), s.x[1] - p.lr * 20 * g[1] / (Math.sqrt(s.G[1]) + 1e-8)]; } },
  rmsprop: { name: 'RMSProp',
    step: (F, s, p) => { const g = F.g(s.x), E = s.E ?? [0, 0]; s.E = [0.9 * E[0] + 0.1 * g[0] * g[0], 0.9 * E[1] + 0.1 * g[1] * g[1]]; s.x = [s.x[0] - p.lr * 5 * g[0] / (Math.sqrt(s.E[0]) + 1e-8), s.x[1] - p.lr * 5 * g[1] / (Math.sqrt(s.E[1]) + 1e-8)]; } },
  adam: { name: 'Adam',
    step: (F, s, p) => {
      const g = F.g(s.x), m = s.m ?? [0, 0], v = s.v2 ?? [0, 0], t = (s.t ?? 0) + 1;
      s.m = [0.9 * m[0] + 0.1 * g[0], 0.9 * m[1] + 0.1 * g[1]];
      s.v2 = [0.999 * v[0] + 0.001 * g[0] * g[0], 0.999 * v[1] + 0.001 * g[1] * g[1]]; s.t = t;
      const mh = [s.m[0] / (1 - 0.9 ** t), s.m[1] / (1 - 0.9 ** t)], vh = [s.v2[0] / (1 - 0.999 ** t), s.v2[1] / (1 - 0.999 ** t)];
      s.x = [s.x[0] - p.lr * 5 * mh[0] / (Math.sqrt(vh[0]) + 1e-8), s.x[1] - p.lr * 5 * mh[1] / (Math.sqrt(vh[1]) + 1e-8)];
    } },
  newton: { name: 'Newton', smooth: true,
    step: (F, s) => {
      const g = F.g(s.x), H = F.h(s.x), det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
      if (Math.abs(det) < 1e-12) return;
      const d = [(H[1][1] * g[0] - H[0][1] * g[1]) / det, (-H[1][0] * g[0] + H[0][0] * g[1]) / det];
      s.x = add(s.x, d, -1);
    } },
  bfgs: { name: 'BFGS (Armijo)', smooth: true,
    step: (F, s) => {
      const B = s.B ?? [[1, 0], [0, 1]], g = F.g(s.x);
      const d = [-(B[0][0] * g[0] + B[0][1] * g[1]), -(B[1][0] * g[0] + B[1][1] * g[1])];
      let a = 1; const f0 = F.f(s.x), gd = dot(g, d);
      while (F.f(add(s.x, d, a)) > f0 + 1e-4 * a * gd && a > 1e-10) a *= 0.5;
      const xn = add(s.x, d, a), sv = [xn[0] - s.x[0], xn[1] - s.x[1]], gn = F.g(xn), y = [gn[0] - g[0], gn[1] - g[1]], sy = dot(sv, y);
      if (sy > 1e-12) {
        // B <- (I - r s y') B (I - r y s') + r s s'
        const r = 1 / sy, I = [[1, 0], [0, 1]];
        const L = [[I[0][0] - r * sv[0] * y[0], I[0][1] - r * sv[0] * y[1]], [I[1][0] - r * sv[1] * y[0], I[1][1] - r * sv[1] * y[1]]];
        const mul = (P, Q) => [[P[0][0] * Q[0][0] + P[0][1] * Q[1][0], P[0][0] * Q[0][1] + P[0][1] * Q[1][1]], [P[1][0] * Q[0][0] + P[1][1] * Q[1][0], P[1][0] * Q[0][1] + P[1][1] * Q[1][1]]];
        const T = mul(mul(L, B), [[L[0][0], L[1][0]], [L[0][1], L[1][1]]]);
        s.B = [[T[0][0] + r * sv[0] * sv[0], T[0][1] + r * sv[0] * sv[1]], [T[1][0] + r * sv[1] * sv[0], T[1][1] + r * sv[1] * sv[1]]];
      }
      s.x = xn;
    } },
  bundle: { name: 'Proximal bundle', it: 'Bundle prossimale',
    step: (F, s, p) => {
      // minimize f: the model is the max of the cuts; in the terms of the
      // dual machinery, maximize -model over the box shifted to the origin
      const [x0, , y0] = F.box, W = Math.max(F.box[1] - F.box[0], F.box[3] - F.box[2]);
      const cut = x => { const fx = F.f(x), g = F.g(x), l = [x[0] - x0, x[1] - y0]; return { value: -(fx - dot(g, l)), slope: [-g[0], -g[1]] }; };
      s.cuts = s.cuts ?? [cut(s.x)];
      s.c = s.c ?? s.x;
      const r = proxMax(s.cuts, W, [s.c[0] - x0, s.c[1] - y0], p.t);
      const xn = [r.lam[0] + x0, r.lam[1] + y0];
      const pred = F.f(s.c) - (-Math.min(...s.cuts.map(k => k.value + dot(k.slope, r.lam))));
      if (pred < 1e-9) return;
      // a bundle of at most 40 cuts, the oldest dropped: the master grows
      // as the cube of the cuts, and the race must stay smooth
      s.cuts.push(cut(xn));
      if (s.cuts.length > 40) s.cuts.shift();
      if (F.f(s.c) - F.f(xn) >= 0.1 * pred) s.c = xn;
      s.x = s.c;
      s.probe = xn;
    } },
};

// the colour of each algorithm: the violet scale of the site with its gold,
// and four hues for the adaptive methods and BFGS; lighter in the dark theme
const palette = {
  light: { gd: '#5f4b76', polyak: '#7338a8', nesterov: '#9363be', adagrad: '#3b5fa8', rmsprop: '#047b7d', adam: '#c0281e', newton: '#b59a45', bfgs: '#6c5920', bundle: '#2e2040' },
  dark: { gd: '#c9bdd7', polyak: '#d4b9eb', nesterov: '#b98ee6', adagrad: '#86a8ee', rmsprop: '#4cc4bf', adam: '#f2786c', newton: '#e3c96f', bfgs: '#b59a45', bundle: '#f6effc' },
};

// -------------------------------------------------------------------- state
// the race is computed as far as it is shown, up to the horizon HZ; the
// iteration k shown drives the map, the surface and the curves together
const HZ = 600, TRAIL = 30, SPEEDS = [1, 2, 5, 10, 20, 30, 60, 120];
let Fname = 'rosenbrock', F = functions[Fname], start = F.start.slice(), logScale = !!F.log;
let chosen = new Set(['gd', 'polyak', 'adam', 'newton', 'bfgs', 'bundle']);
const params = { lr: 0.002, t: 0.5 };
let runs = [], replays = [], done = 0, k = 0, ips = 30, playing = false, traceSrc = '';
let hoverMap = null, hover3d = null, C = null;

function reset() {
  stop();
  k = 0; done = 0;
  runs = [...chosen].filter(a => !(algorithms[a].smooth && !F.h)).map(a => ({ k: a, s: { x: start.slice() }, path: [start.slice()], vals: [F.f(start)] }));
  draw(); save();
}
// one more iteration for every run; a run gone to infinity stays where it is
function advance() {
  for (const r of runs) {
    const x = r.s.x;
    if (isFinite(x[0]) && isFinite(x[1]) && Math.abs(x[0]) < 1e6 && Math.abs(x[1]) < 1e6) algorithms[r.k].step(F, r.s, params);
    r.path.push(r.s.x.slice()); r.vals.push(F.f(r.s.x));
  }
  done++;
}
function goTo(n) {
  k = Math.max(0, Math.min(HZ, Math.round(n)));
  while (done < k) advance();
  draw(); save();
}
const step = () => goTo(k + 1), back = () => goTo(k - 1);

// Play advances ips iterations per second, one frame at a time
let raf = 0, lastT = 0, acc = 0;
function stop() { if (playing) save(); playing = false; cancelAnimationFrame(raf); $('play').textContent = tr('Play', 'Avvia'); }
function play() {
  if (playing) return stop();
  if (k >= HZ) goTo(0);
  playing = true; $('play').textContent = tr('Pause', 'Pausa'); lastT = performance.now(); acc = 0;
  // the clock of the page, not that of the frame (which may precede the
  // click); a hidden page does not jump forward when it comes back
  const tick = () => {
    const now = performance.now();
    acc += Math.min(0.5, Math.max(0, now - lastT) / 1000) * ips; lastT = now;
    if (acc >= 1) { const n = Math.floor(acc); acc -= n; goTo(k + n); }
    if (k >= HZ) return stop();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

// the runs replayed from a trace of a real library (tools/optiml_trace.py):
// one recorded iterate per iteration, drawn dashed, in the colour of the same
// algorithm here when there is one
const replayKey = n => (/steepest|gradientdescent/i.test(n) ? 'gd' : /newton/i.test(n) ? 'newton' : /bfgs/i.test(n) ? 'bfgs'
  : /adam/i.test(n) ? 'adam' : /adagrad/i.test(n) ? 'adagrad' : /rmsprop/i.test(n) ? 'rmsprop' : /conjugate/i.test(n) ? 'nesterov' : null);
async function loadTrace(json, keep = false) {
  const t = typeof json === 'string' ? await (await fetch(json)).json() : json;
  if (t.function && functions[t.function] && t.function !== Fname) { Fname = t.function; F = functions[Fname]; $('fn').value = Fname; logScale = !!F.log; $('log').checked = logScale; useLr(); computeField(); }
  start = t.start || start;
  const keys = Object.keys(palette.light);
  replays = t.runs.map((r, i) => ({ name: `${t.source || 'trace'}: ${r.name}`, key: replayKey(r.name) || keys[i % keys.length], all: r.points }));
  if (!keep) reset();
}
const shown = r => r.all[Math.min(k, r.all.length - 1)];

// ------------------------------------------------------------------- theme
// the colours come from the tokens of style.css and are read again when the
// theme changes; the scale of the heights goes from the violet of the site
// (the minimum) through its lilac to the panel (the top of the box)
const hex = s => { s = s.replace('#', ''); if (s.length === 3) s = [...s].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
const mix = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));
function readTheme() {
  const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  C = { ground: v('--ground'), ink: v('--ink'), inkSoft: v('--ink-soft'), rule: v('--rule'), accent: v('--accent'), lilac: v('--lilac'), gold: v('--gold'), panel: v('--panel') };
  const g = hex(C.ground), dark = 0.3 * g[0] + 0.6 * g[1] + 0.1 * g[2] < 128;
  C.alg = palette[dark ? 'dark' : 'light'];
  const s0 = mix(hex(C.accent), hex(C.lilac), 0.25), s1 = hex(C.lilac), s2 = hex(C.panel);
  C.scale = t => (t < 0.45 ? mix(s0, s1, t / 0.45) : mix(s1, s2, Math.min(1, (t - 0.45) / 0.55)));
}
function applyTheme() {
  readTheme(); bands = null;
  for (const i of document.querySelectorAll('#algos i[data-k]')) i.style.background = C.alg[i.dataset.k];
  surf?.setColors(C);
  draw();
}

// ----------------------------------------------------------------- the field
// the function on a grid of the box, in the scale of the heights (log(1 + f)
// on the steep ones), its level lines by marching squares, and the ticks of f
const N = 220, LEVELS = 15;
let field = null, bands = null, surf = null;
const W = z => (logScale ? Math.log1p(Math.max(z, 0)) : z);
function computeField() {
  const [x0, x1, y0, y1] = F.box, v = new Float64Array(N * N);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const w = W(F.f([x0 + (i + 0.5) / N * (x1 - x0), y1 - (j + 0.5) / N * (y1 - y0)]));
    v[j * N + i] = w; lo = Math.min(lo, w); hi = Math.max(hi, w);
  }
  const height = (x, y) => Math.min(1.02, Math.max(0, (W(F.f([x, y])) - lo) / (hi - lo)));
  const contours = [];
  for (let l = 1; l < LEVELS; l++) contours.push({ t: l / LEVELS, segs: march(v, lo + l / LEVELS * (hi - lo)) });
  field = { v, lo, hi, contours }; bands = null;
  // the ticks of f: decades on the log scale, round values otherwise
  let ft;
  if (logScale) {
    ft = [0, ...Array.from({ length: 12 }, (_, e) => 10 ** e)].filter(f => W(f) >= lo - 1e-9 && W(f) <= hi + 1e-9);
    while (ft.length > 6) ft = ft.filter((_, i) => i % 2 === 0);
  } else ft = niceTicks(lo, hi, 4);
  surf?.setLandscape({ box: F.box, height, contours, minima: F.minima, fname: logScale ? 'f (log)' : 'f',
    fticks: ft.map(f => ({ t: (W(f) - lo) / (hi - lo), text: fmt(f) })) });
}
// the level line at w of the grid v, as segments x, y, x, y in the plane
function march(v, w) {
  const [x0, x1, y0, y1] = F.box, out = [];
  const X = i => x0 + (i + 0.5) / N * (x1 - x0), Y = j => y1 - (j + 0.5) / N * (y1 - y0);
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = v[j * N + i], b = v[j * N + i + 1], c = v[(j + 1) * N + i + 1], d = v[(j + 1) * N + i];
    const q = (a > w ? 8 : 0) | (b > w ? 4 : 0) | (c > w ? 2 : 0) | (d > w ? 1 : 0);
    if (q === 0 || q === 15) continue;
    const T = [X(i + (w - a) / (b - a)), Y(j)], R = [X(i + 1), Y(j + (w - b) / (c - b))];
    const B = [X(i + (w - d) / (c - d)), Y(j + 1)], Lf = [X(i), Y(j + (w - a) / (d - a))];
    const segs = { 1: [Lf, B], 2: [B, R], 3: [Lf, R], 4: [T, R], 5: [Lf, T, B, R], 6: [T, B], 7: [Lf, T], 8: [Lf, T], 9: [T, B], 10: [T, R, Lf, B], 11: [T, R], 12: [Lf, R], 13: [B, R], 14: [Lf, B] }[q];
    for (let s = 0; s < segs.length; s += 2) out.push(segs[s][0], segs[s][1], segs[s + 1][0], segs[s + 1][1]);
  }
  return out;
}
// the filled levels, as an image of the grid, made again with the theme
function bandImage() {
  const img = new ImageData(N, N), { v, lo, hi } = field;
  for (let q = 0; q < N * N; q++) {
    const band = Math.min(LEVELS - 1, Math.floor((v[q] - lo) / (hi - lo) * LEVELS));
    img.data.set([...C.scale((band + 0.5) / LEVELS).map(Math.round), 255], q * 4);
  }
  const off = document.createElement('canvas'); off.width = off.height = N;
  off.getContext('2d').putImageData(img, 0, 0);
  return off;
}

// --------------------------------------------------------------------- map
// a canvas at the resolution of the screen, square, as large as its box
function fit(cv, w, h) {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  return g;
}
let mapR = null;
function drawMap() {
  const cv = $('map'), wrap = cv.parentElement, s = Math.max(200, Math.min(wrap.clientWidth, wrap.clientHeight || wrap.clientWidth));
  const g = fit(cv, s, s), big = s > 700, fs = big ? 15 : 11;
  g.fillStyle = C.ground; g.fillRect(0, 0, s, s);
  const R = mapR = { x: big ? 62 : 44, y: 10, w: s - (big ? 76 : 56), h: s - (big ? 58 : 44) };
  const [x0, x1, y0, y1] = F.box, X = x => R.x + (x - x0) / (x1 - x0) * R.w, Y = y => R.y + (y1 - y) / (y1 - y0) * R.h;
  bands = bands || bandImage();
  g.imageSmoothingEnabled = true; g.drawImage(bands, R.x, R.y, R.w, R.h);
  // the level lines
  g.strokeStyle = C.ink; g.globalAlpha = 0.28; g.lineWidth = 0.8; g.beginPath();
  for (const { segs } of field.contours) for (let i = 0; i < segs.length; i += 4) { g.moveTo(X(segs[i]), Y(segs[i + 1])); g.lineTo(X(segs[i + 2]), Y(segs[i + 3])); }
  g.stroke(); g.globalAlpha = 1;
  // the frame, the ticks and the names of the axes
  g.strokeStyle = C.rule; g.lineWidth = 1; g.strokeRect(R.x, R.y, R.w, R.h);
  g.fillStyle = C.inkSoft; g.strokeStyle = C.inkSoft; g.font = `${fs}px "IBM Plex Mono", monospace`;
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const v of niceTicks(x0, x1)) { g.beginPath(); g.moveTo(X(v), R.y + R.h); g.lineTo(X(v), R.y + R.h + 4); g.stroke(); g.fillText(fmt(v), X(v), R.y + R.h + 6); }
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of niceTicks(y0, y1)) { g.beginPath(); g.moveTo(R.x, Y(v)); g.lineTo(R.x - 4, Y(v)); g.stroke(); g.fillText(fmt(v), R.x - 7, Y(v)); }
  g.fillStyle = C.ink; g.font = `${fs + 2}px "IBM Plex Mono", monospace`;
  g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('x₁', R.x + R.w / 2, s - 1);
  g.save(); g.translate(fs + 1, R.y + R.h / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText('x₂', 0, -fs / 2 + 2); g.restore();

  g.save(); g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
  // a fading trail: the last TRAIL steps strong, the older ones faint, each
  // over a halo of the ground so that it reads on every level
  const trail = (path, color, dash, width) => {
    g.setLineDash(dash); g.lineCap = 'round';
    for (const [stroke, wd, al] of [[C.ground, width + 2.6, 0.55], [color, width, 1]]) {
      g.strokeStyle = stroke; g.lineWidth = wd;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        if (!isFinite(a[0] + a[1] + b[0] + b[1])) continue;
        g.globalAlpha = al * Math.max(0.22, 1 - (path.length - 1 - i) / TRAIL);
        g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.stroke();
      }
    }
    g.globalAlpha = 1; g.setLineDash([]);
  };
  const rad = big ? 8 : 5.5;
  for (const r of replays) {
    const path = r.all.slice(0, Math.min(k + 1, r.all.length)), p = path.at(-1), col = C.alg[r.key];
    trail(path, col, [5, 4], 2);
    g.fillStyle = col; g.strokeStyle = C.ground; g.lineWidth = 2;
    g.fillRect(X(p[0]) - rad * 0.75, Y(p[1]) - rad * 0.75, rad * 1.5, rad * 1.5); g.strokeRect(X(p[0]) - rad * 0.75, Y(p[1]) - rad * 0.75, rad * 1.5, rad * 1.5);
  }
  for (const r of runs) {
    const path = r.path.slice(0, k + 1), p = path.at(-1), col = C.alg[r.k];
    trail(path, col, [], 2.2);
    if (!isFinite(p[0] + p[1])) continue;
    g.fillStyle = col; g.strokeStyle = C.ground; g.lineWidth = 2;
    g.beginPath(); g.arc(X(p[0]), Y(p[1]), rad, 0, 7); g.fill(); g.stroke();
  }
  // the minima, the start, and the point under the pointer on the surface
  g.strokeStyle = C.gold; g.lineWidth = 2;
  for (const m of F.minima || []) { const a = X(m[0]), b = Y(m[1]), q = rad; g.beginPath(); g.moveTo(a, b - q); g.lineTo(a + q, b); g.lineTo(a, b + q); g.lineTo(a - q, b); g.closePath(); g.stroke(); }
  g.fillStyle = C.gold; g.strokeStyle = C.ground;
  g.beginPath(); g.arc(X(start[0]), Y(start[1]), rad + 0.5, 0, 7); g.fill(); g.stroke();
  if (hover3d) {
    const a = X(hover3d[0]), b = Y(hover3d[1]), q = rad + 4;
    g.strokeStyle = C.gold; g.lineWidth = 2;
    g.beginPath(); g.moveTo(a - q, b); g.lineTo(a + q, b); g.moveTo(a, b - q); g.lineTo(a, b + q); g.stroke();
  }
  g.restore();
}

// ------------------------------------------------------------------- curves
function drawCurves() {
  const cv = $('curves'), w = cv.parentElement.clientWidth || 520, h = Math.round(Math.min(300, Math.max(200, w * 0.5)));
  const g = fit(cv, w, h);
  g.clearRect(0, 0, w, h);
  const vals = [...runs.map(r => r.vals), ...replays.map(r => r.vals ||= r.all.map(p => F.f(p)))];
  const fmin = Math.min(F.f(start), ...vals.flat().filter(isFinite));
  const L = v => Math.log10(Math.max(v - fmin, 0) + 1e-8);
  const lo = -8, hi = Math.ceil(L(F.f(start))) + 1, n = Math.max(20, done);
  const R = { x: 48, y: 18, w: w - 58, h: h - 44 };
  const X = i => R.x + i / n * R.w, Y = v => R.y + (hi - Math.min(hi, Math.max(v, lo))) / (hi - lo) * R.h;
  g.font = '11px "IBM Plex Mono", monospace'; g.lineWidth = 1;
  // the decades and the iterations
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let e = lo; e <= hi; e += 2) {
    g.strokeStyle = C.rule; g.beginPath(); g.moveTo(R.x, Y(e)); g.lineTo(R.x + R.w, Y(e)); g.stroke();
    g.fillStyle = C.inkSoft; g.fillText(`1e${e}`, R.x - 5, Y(e));
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const i of niceTicks(0, n, 5)) { g.strokeStyle = C.inkSoft; g.beginPath(); g.moveTo(X(i), R.y + R.h); g.lineTo(X(i), R.y + R.h + 4); g.stroke(); g.fillText(fmt(i), X(i), R.y + R.h + 6); }
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(tr('f − best f found (log)', 'f − miglior f trovato (log)'), R.x, 11);
  g.textAlign = 'right'; g.fillText(tr('iteration', 'iterazione'), R.x + R.w, h - 2);
  // where the race is now
  g.strokeStyle = C.inkSoft; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(k), R.y); g.lineTo(X(k), R.y + R.h); g.stroke(); g.setLineDash([]);
  const line = (vs, col, dash) => {
    g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dash); g.beginPath();
    for (let i = 0; i <= Math.min(k, vs.length - 1); i++) { const a = X(i), b = Y(L(vs[i])); i ? g.lineTo(a, b) : g.moveTo(a, b); }
    g.stroke(); g.setLineDash([]);
  };
  for (const r of replays) line(r.vals, C.alg[r.key], [5, 4]);
  for (const r of runs) line(r.vals, C.alg[r.k], []);
}

function draw() {
  drawMap();
  surf?.setRuns([
    ...replays.map((r, i) => ({ id: 'trace' + i, src: r.all, color: C.alg[r.key], path: r.all.slice(0, Math.min(k + 1, r.all.length)), marker: 'cube', trail: TRAIL })),
    ...runs.map(r => ({ id: r.k, src: r.path, color: C.alg[r.k], path: r.path.slice(0, k + 1), marker: 'ball', trail: TRAIL })),
  ]);
  drawCurves();
  $('legend').replaceChildren(...runs.map(r => {
    const li = document.createElement('li'), v = r.vals[k];
    li.innerHTML = `<i style="background:${C.alg[r.k]}"></i>${label(algorithms[r.k])} <b>${isFinite(v) ? v.toPrecision(4) : tr('diverged', 'divergente')}</b>`;
    return li;
  }), ...replays.map(r => {
    const li = document.createElement('li'), c = C.alg[r.key];
    li.innerHTML = `<i style="height:0;border-top:2px dashed ${c};background:none"></i>${r.name} <b>${F.f(shown(r)).toPrecision(4)}</b>`;
    return li;
  }));
  $('iter').textContent = k;
  for (const e of document.querySelectorAll('.fiter b')) e.textContent = k;
  $('scrub').value = k;
}

// ------------------------------------------------------------- the address
// the function, the parameters, the start, the algorithms, the trace and the
// iteration shown, written into the address as the other scenes do
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const o = { f: Fname, lr: params.lr, t: params.t, log: +logScale, sc: +$('sc').checked, ips, a: [...chosen].join(','), k };
    if (traceSrc) o.tr = traceSrc;
    else if (start[0] !== F.start[0] || start[1] !== F.start[1]) o.s = start.map(v => +v.toFixed(3)).join(',');
    history.replaceState(null, '', '#' + new URLSearchParams(o));
  }, 250);
}

// -------------------------------------------------------------------- setup
// the names in the language of the page (the functions and the algorithms
// keep the Italian beside the English, the options are written again)
const label = o => tr(o.label ?? o.name, o.it ?? o.label ?? o.name);
const TRACES = { '': ['none', 'nessuna'], 'traces/rosenbrock-optiml.json': ['optiml on Rosenbrock (real run)', 'optiml su Rosenbrock (esecuzione reale)'],
  'traces/rosenbrock2-optiml.json': ['optiml on Rosenbrock, b = 2 (real run)', 'optiml su Rosenbrock, b = 2 (esecuzione reale)'],
  'traces/optimlQuadratic-optiml.json': ['optiml on its quadratic (real run)', 'optiml sulla sua quadratica (esecuzione reale)'],
  'traces/sixhump-optiml.json': ['optiml on Six-Hump Camel (real run)', 'optiml su Six-Hump Camel (esecuzione reale)'] };
function texts() {
  for (const o of $('fn').options) o.textContent = label(functions[o.value]);
  for (const o of $('traceSel').options) if (TRACES[o.value]) o.textContent = tr(...TRACES[o.value]);
  for (const n of document.querySelectorAll('#algos .algo')) n.lastChild.textContent = label(algorithms[n.querySelector('i').dataset.k]);
  $('play').textContent = playing ? tr('Pause', 'Pausa') : tr('Play', 'Avvia');
  $('step').textContent = tr('Step', 'Passo');
  fsTexts();
  document.title = tr('Learning playground', 'Laboratorio di apprendimento');
}
for (const [key, f] of Object.entries(functions)) $('fn').append(new Option(label(f), key, false, key === Fname));
function useLr() { params.lr = F.lr; $('lr').value = F.lr; $('lrOut').textContent = F.lr; }
function useFunction(name) { Fname = name; F = functions[Fname]; start = F.start.slice(); logScale = !!F.log; $('log').checked = logScale; useLr(); computeField(); }
$('fn').addEventListener('change', e => { traceSrc = ''; $('traceSel').value = ''; replays = []; useFunction(e.target.value); reset(); });
readTheme();
for (const [key, a] of Object.entries(algorithms)) {
  const lab = document.createElement('label'); lab.className = 'algo';
  lab.innerHTML = `<input type="checkbox" ${chosen.has(key) ? 'checked' : ''}><i data-k="${key}" style="background:${C.alg[key]}"></i>${label(a)}`;
  lab.querySelector('input').addEventListener('change', e => { e.target.checked ? chosen.add(key) : chosen.delete(key); reset(); });
  $('algos').appendChild(lab);
}
for (const key of ['lr', 't']) $(key).addEventListener('input', e => { params[key] = +e.target.value; $(key + 'Out').textContent = e.target.value; reset(); });
$('log').addEventListener('change', e => { logScale = e.target.checked; computeField(); draw(); save(); });
$('sc').addEventListener('change', e => { surf?.setSurfaceLines(e.target.checked); save(); });
const setSpeed = i => { ips = SPEEDS[i]; $('speed').value = i; $('speedOut').textContent = ips + '/s'; };
$('speed').addEventListener('input', e => { setSpeed(+e.target.value); save(); });
$('scrub').max = HZ;
$('scrub').addEventListener('input', e => { stop(); goTo(+e.target.value); });

// the map: a click moves the start, the pointer shows its point on the surface
const toPlane = e => {
  const r = e.target.getBoundingClientRect(), [x0, x1, y0, y1] = F.box, R = mapR;
  const u = (e.clientX - r.left - R.x) / R.w, v = (e.clientY - r.top - R.y) / R.h;
  return u < 0 || u > 1 || v < 0 || v > 1 ? null : [x0 + u * (x1 - x0), y1 - v * (y1 - y0)];
};
const readout = p => { $('readout').textContent = p ? `(${p[0].toFixed(2)}, ${p[1].toFixed(2)})  f = ${F.f(p).toPrecision(4)}` : ''; };
$('map').addEventListener('click', e => { const p = toPlane(e); if (!p) return; traceSrc = ''; $('traceSel').value = ''; replays = []; start = p; reset(); });
$('map').addEventListener('pointermove', e => { hoverMap = toPlane(e); readout(hoverMap); surf?.setHover(hoverMap); });
$('map').addEventListener('pointerleave', () => { hoverMap = null; readout(null); surf?.setHover(null); });

$('step').addEventListener('click', step);
$('play').addEventListener('click', play);
$('reset').addEventListener('click', reset);
$('traceSel').addEventListener('change', e => { traceSrc = e.target.value; if (traceSrc) loadTrace(traceSrc); else { replays = []; reset(); } });
$('traceFile').addEventListener('change', async e => { const f = e.target.files[0]; if (f) { traceSrc = ''; $('traceSel').value = ''; loadTrace(JSON.parse(await f.text())); } });
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox')) return;
  if (t.type === 'range') return;
  if (e.key === 'ArrowRight') step();
  if (e.key === 'ArrowLeft') back();
  if (e.key === ' ') { e.preventDefault(); play(); }
});

// the two figures: full screen, the camera, the rotation
for (const b of document.querySelectorAll('[data-fs]')) {
  if (!document.fullscreenEnabled) { b.hidden = true; continue; }
  const fig = $(b.dataset.fs);
  b.addEventListener('click', () => (document.fullscreenElement === fig ? document.exitFullscreen() : fig.requestFullscreen()));
}
function fsTexts() {
  for (const b of document.querySelectorAll('[data-fs]')) b.textContent = document.fullscreenElement === $(b.dataset.fs) ? tr('exit full screen', 'esci dallo schermo intero') : tr('full screen', 'schermo intero');
}
document.addEventListener('fullscreenchange', fsTexts);
$('rotate').addEventListener('click', e => { const on = e.target.getAttribute('aria-pressed') !== 'true'; e.target.setAttribute('aria-pressed', on); surf?.setAutoRotate(on); });
$('home').addEventListener('click', () => surf?.resetCamera());
new ResizeObserver(() => { drawMap(); drawCurves(); }).observe($('mapwrap'));

// the theme of the site, chosen there or by the system
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
onLang(() => { texts(); draw(); });
texts();

async function init() {
  const q = new URLSearchParams(location.hash.slice(1));
  useFunction(functions[q.get('f')] ? q.get('f') : Fname);
  const tr = q.get('tr');
  if (tr && [...$('traceSel').options].some(o => o.value === tr)) { traceSrc = tr; $('traceSel').value = tr; await loadTrace(tr, true); }
  if (q.has('lr') && +q.get('lr') > 0) { params.lr = +q.get('lr'); $('lr').value = params.lr; $('lrOut').textContent = params.lr; }
  if (q.has('t') && +q.get('t') > 0) { params.t = +q.get('t'); $('t').value = params.t; $('tOut').textContent = params.t; }
  if (q.has('s') && !traceSrc) { const s = q.get('s').split(',').map(Number); if (s.length === 2 && s.every(isFinite)) start = s; }
  if (q.has('a')) chosen = new Set(q.get('a').split(',').filter(a => algorithms[a]));
  for (const lab of $('algos').children) lab.querySelector('input').checked = chosen.has(lab.querySelector('i').dataset.k);
  if (q.has('log') && +q.get('log') !== +logScale) { logScale = q.get('log') === '1'; $('log').checked = logScale; computeField(); }
  if (q.get('sc') === '1') $('sc').checked = true;
  const si = SPEEDS.indexOf(+q.get('ips'));
  setSpeed(si >= 0 ? si : SPEEDS.indexOf(30));
  try {
    surf = createSurface($('surface'), { onHover: p => { hover3d = p; readout(p); drawMap(); } });
    surf.setColors(C); computeField(); surf.setSurfaceLines($('sc').checked);
  } catch (err) {
    // without WebGL the map and the curves still work
    $('surface').textContent = tr('The surface needs WebGL, which this browser does not offer.', 'La superficie richiede WebGL, che questo browser non offre.');
    console.warn(err);
  }
  reset();
  goTo(+q.get('k') || 0);
  // the labels of the surface are drawn in the font of the page once it is there
  document.fonts?.ready.then(() => surf?.setColors(C));
}
init();

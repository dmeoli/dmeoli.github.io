// Algorithms for the Lagrangian dual in two multipliers, with the same shape as
// those in one: declared parameters, init and step, the whole trace in the state.

import { maxModel, proxMax, modelAt, levelProject } from '../problems/lagrangian2d.js';

function start(problem, l) {
  const l0 = [Math.min(problem.lmax, l[0]), Math.min(problem.lmax, l[1])];
  const o = problem.oracle(l0);
  return {
    k: 0, lam: l0, center: l0, done: false,
    trace: [{ ...o, serious: true }],
    columns: [o.column], cuts: [problem.cut(o.column)], best: o.value,
  };
}
function addColumn(s, problem, o) {
  if (!s.columns.some(v => v[0] === o.column[0] && v[1] === o.column[1])) {
    s.columns.push(o.column);
    s.cuts.push(problem.cut(o.column));
  }
}
const clip = (l, m) => [Math.min(m, Math.max(0, l[0])), Math.min(m, Math.max(0, l[1]))];
const startParams = {
  l1: { label: 'start \\(\\lambda_1\\)', min: 0, max: 3, step: 0.1, value: 1.8 },
  l2: { label: 'start \\(\\lambda_2\\)', min: 0, max: 3, step: 0.1, value: 1.8 },
};

export const subgradient = {
  name: 'Subgradient',
  params: { ...startParams, s0: { label: 'step size', min: 0.02, max: 1, step: 0.02, value: 0.25 } },
  explain: 'Moves along the subgradient with a step that shrinks as \\(1/\\sqrt{k}\\): it uses only the last cut, so it zig-zags across the borders of the regions.',
  init: (problem, p) => start(problem, [p.l1, p.l2]),
  step(problem, s, p) {
    const last = s.trace.at(-1), h = p.s0 / Math.sqrt(s.k + 1);
    const lam = clip([last.lam[0] + h * last.subgradient[0], last.lam[1] + h * last.subgradient[1]], problem.lmax);
    const o = problem.oracle(lam);
    addColumn(s, problem, o);
    s.trace.push({ ...o, serious: true });
    s.k++; s.lam = lam; s.center = lam; s.best = Math.max(s.best, o.value);
    if (s.k >= 80) s.done = true;
    return s;
  },
};

export const kelley = {
  name: "Kelley's cutting plane",
  params: { ...startParams },
  explain: 'Maximizes the model over the whole box: with few cuts the model is far from the function, so the next point jumps from a corner to another.',
  init: (problem, p) => start(problem, [p.l1, p.l2]),
  step(problem, s) {
    const m = maxModel(s.cuts, problem.lmax);
    if (m.value - s.best < 1e-7) { s.done = true; return s; }
    const o = problem.oracle(m.lam);
    addColumn(s, problem, o);
    s.trace.push({ ...o, serious: true, model: m.value });
    s.k++; s.lam = m.lam; s.center = m.lam; s.best = Math.max(s.best, o.value);
    if (s.k >= 80) s.done = true;
    return s;
  },
};

export const bundle = {
  name: 'Proximal bundle',
  params: { ...startParams,
            t: { label: 'prox \\(t\\)', min: 0.02, max: 3, step: 0.02, value: 0.3 },
            m1: { label: 'descent \\(m_1\\)', min: 0.01, max: 0.9, step: 0.01, value: 0.1 } },
  explain: 'Maximizes the model minus \\(\\|\\lambda - c\\|^2 / 2t\\) around the stability centre \\(c\\) (the circle): the centre moves only on serious steps; null steps just add a cut.',
  init: (problem, p) => start(problem, [p.l1, p.l2]),
  step(problem, s, p) {
    const m = proxMax(s.cuts, problem.lmax, s.center, p.t);
    const fc = problem.L(s.center), delta = modelAt(s.cuts, m.lam) - fc;
    if (delta < 1e-7) { s.done = true; return s; }
    const o = problem.oracle(m.lam);
    const serious = o.value - fc >= p.m1 * delta;
    addColumn(s, problem, o);
    s.trace.push({ ...o, serious, center: s.center });
    s.k++; s.lam = m.lam;
    if (serious) s.center = m.lam;
    s.best = Math.max(s.best, o.value);
    if (s.k >= 80) s.done = true;
    return s;
  },
};

export const level = {
  name: 'Level bundle',
  params: { ...startParams,
            gamma: { label: 'level \\(\\gamma\\)', min: 0.05, max: 0.95, step: 0.05, value: 0.3 } },
  explain: 'Fixes a level between the best value found and the maximum of the model, and moves to the point of the level set of the model nearest to the centre: it never jumps further than the model allows.',
  init: (problem, p) => start(problem, [p.l1, p.l2]),
  step(problem, s, p) {
    const up = maxModel(s.cuts, problem.lmax).value;
    if (up - s.best < 1e-7) { s.done = true; return s; }
    const lev = s.best + p.gamma * (up - s.best);
    const lam = levelProject(s.cuts, problem.lmax, s.center, lev);
    const o = problem.oracle(lam);
    const serious = o.value > problem.L(s.center) + 1e-12;
    addColumn(s, problem, o);
    s.trace.push({ ...o, serious, center: s.center, level: lev });
    s.k++; s.lam = lam;
    if (serious) s.center = lam;
    s.best = Math.max(s.best, o.value);
    if (s.k >= 80) s.done = true;
    return s;
  },
};

import { subgradSolver, bundleSolver } from './smspp2d.js';

// the replay of a trace (TRACE-FORMAT.md): one recorded oracle call per step
export const replay = {
  name: 'Replay of a trace',
  params: {},
  explain: 'Replays a recorded run (a trace written by SMS++ or exported from this page): every step is the next oracle call of the run, with its columns, serious and null steps and centre.',
  init(problem) {
    const it = (window.dmeoliTrace && window.dmeoliTrace.iterations) || [];
    const s = { k: 0, done: it.length <= 1, trace: [], columns: [], cuts: [], best: -Infinity, lam: [0, 0], center: [0, 0], all: it };
    replay.push(problem, s, 0);
    return s;
  },
  push(problem, s, i) {
    const o = s.all[i];
    if (!o) { s.done = true; return; }
    s.trace.push({ ...o });
    if (o.column && !s.columns.some(v => v[0] === o.column[0] && v[1] === o.column[1])) { s.columns.push(o.column); s.cuts.push(problem.cut(o.column)); }
    s.lam = o.lam; s.center = o.center || o.lam; s.best = Math.max(s.best, o.value);
  },
  step(problem, s) {
    s.k++;
    replay.push(problem, s, s.k);
    if (s.k >= s.all.length - 1) s.done = true;
    return s;
  },
};

export const algorithms = { subgradient, kelley, bundle, level, subgradSolver, bundleSolver, replay };

// Algorithms for the Lagrangian dual in one multiplier. Each one declares its
// parameters (the shell builds the controls from them) and has init and step;
// a step returns the new state, and the state keeps the whole trace.

import { maxOfMin } from '../problems/lagrangian1d.js';

function start(problem, l0) {
  const o = problem.oracle(l0);
  return {
    k: 0, lam: l0, center: l0, done: false,
    trace: [{ ...o, serious: true }],
    columns: [o.column], cuts: [problem.cut(o.column)],
    best: o.value,
  };
}

function addColumn(state, problem, o) {
  if (!state.columns.some(v => v[0] === o.column[0] && v[1] === o.column[1])) {
    state.columns.push(o.column);
    state.cuts.push(problem.cut(o.column));
  }
}

export const subgradient = {
  name: 'Subgradient',
  params: { l0: { label: 'start', min: 0, max: 3, step: 0.1, value: 0 },
            s0: { label: 'step size', min: 0.05, max: 2, step: 0.05, value: 0.6 } },
  explain: 'Moves along the subgradient with a step that shrinks as \\(1/\\sqrt{k}\\): it uses only the last cut, so it zig-zags around the maximum.',
  init: (problem, p) => start(problem, p.l0),
  step(problem, s, p) {
    const last = s.trace.at(-1);
    const lam = Math.min(problem.lmax, Math.max(0, last.lam + p.s0 / Math.sqrt(s.k + 1) * last.subgradient));
    const o = problem.oracle(lam);
    addColumn(s, problem, o);
    s.trace.push({ ...o, serious: true });
    s.k++; s.lam = lam; s.center = lam; s.best = Math.max(s.best, o.value);
    if (s.k >= 60) s.done = true;
    return s;
  },
};

export const kelley = {
  name: "Kelley's cutting plane",
  params: { l0: { label: 'start', min: 0, max: 3, step: 0.1, value: 0 } },
  explain: 'Maximizes the model, the minimum of all the cuts found so far, over the whole interval: the next point can jump far away from a good one.',
  init: (problem, p) => start(problem, p.l0),
  step(problem, s) {
    const m = maxOfMin(s.cuts, 0, problem.lmax);
    if (m.value - s.best < 1e-7) { s.done = true; return s; }
    const o = problem.oracle(m.lam);
    addColumn(s, problem, o);
    s.trace.push({ ...o, serious: true, model: m.value });
    s.k++; s.lam = m.lam; s.center = m.lam; s.best = Math.max(s.best, o.value);
    return s;
  },
};

export const bundle = {
  name: 'Proximal bundle',
  params: { l0: { label: 'start', min: 0, max: 3, step: 0.1, value: 0 },
            t: { label: 'prox \\(t\\)', min: 0.05, max: 5, step: 0.05, value: 0.5 },
            m1: { label: 'descent \\(m_1\\)', min: 0.01, max: 0.9, step: 0.01, value: 0.1 } },
  explain: 'Maximizes the model minus \\((\\lambda - c)^2 / 2t\\) around the stability centre \\(c\\): the centre moves only when the new point improves enough (serious step), otherwise the cut just enriches the model (null step).',
  init: (problem, p) => start(problem, p.l0),
  step(problem, s, p) {
    const model = l => Math.min(...s.cuts.map(k => k.value + k.slope * l));
    const f = l => model(l) - (l - s.center) ** 2 / (2 * p.t);
    let lo = 0, hi = problem.lmax;
    for (let i = 0; i < 100; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (f(m1) < f(m2)) lo = m1; else hi = m2;
    }
    const lam = (lo + hi) / 2, fc = problem.L(s.center), delta = model(lam) - fc;
    if (delta < 1e-7) { s.done = true; return s; }
    const o = problem.oracle(lam);
    const serious = o.value - fc >= p.m1 * delta;
    addColumn(s, problem, o);
    s.trace.push({ ...o, serious, model: model(lam), center: s.center });
    s.k++; s.lam = lam;
    if (serious) s.center = lam;
    s.best = Math.max(s.best, o.value);
    return s;
  },
};

export const algorithms = { subgradient, kelley, bundle };

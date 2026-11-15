// SubGradSolver and BundleSolver of SMS++, in two dimensions, with the same
// parameters and names (see SMSPP-VARIANTS.md), so that a run here matches a
// configuration there. SMS++ minimizes a convex f; here f = -L, and the code
// works in the terms of SMS++ (f, its subgradients) where the rules are stated.

import { maxModel, proxMax, modelAt, levelProject } from '../problems/lagrangian2d.js';
import { t } from '../i18n.js';

const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
const box = (l, m) => [Math.min(m, Math.max(0, l[0])), Math.min(m, Math.max(0, l[1]))];

function start(problem, p) {
  const l0 = box([p.l1, p.l2], problem.lmax);
  const o = problem.oracle(l0);
  return {
    k: 0, lam: l0, center: l0, done: false,
    trace: [{ ...o, serious: true }],
    columns: [o.column], cuts: [problem.cut(o.column)], best: o.value,
  };
}
// a new column gives a new cut; a column already known adds nothing, unless the
// bundle has dropped its cut (after an aggregation), and then it comes back
function addColumn(s, problem, o) {
  const same = v => v && v[0] === o.column[0] && v[1] === o.column[1];
  if (!s.columns.some(same)) s.columns.push(o.column);
  if (!s.cuts.some(k => same(k.v))) s.cuts.push(problem.cut(o.column));
}
const startParams = {
  l1: { get label() { return t('start \\(\\lambda_1\\)', "inizio \\(\\lambda_1\\)"); }, min: 0, max: 3, step: 0.1, value: 1.8 },
  l2: { get label() { return t('start \\(\\lambda_2\\)', "inizio \\(\\lambda_2\\)"); }, min: 0, max: 3, step: 0.1, value: 1.8 },
};

// ----------------------------------------------------------------------------
// SubGradSolver: l = P(c - nu d), d_i = alpha g_i + (1 - alpha) d_{i-1}
// ----------------------------------------------------------------------------

const STEP = ['Polyak', 'ColorTV', 'FumeroTV', 'PrimalDual', 'diminishing (not in SMS++)'];
const DEFL = ['none', 'Volume'];
// the names shown in the controls; the rules above compare the English ones
const STEP_IT = ['Polyak', 'ColorTV', 'FumeroTV', 'PrimalDual', 'decrescente (non in SMS++)'];
const DEFL_IT = ['nessuna', 'Volume'];

export const subgradSolver = {
  name: 'SubGradSolver (SMS++)',
  params: {
    ...startParams,
    strStepsize: { label: 'strStepsize', get options() { return t(STEP, STEP_IT); }, value: 1 },
    strDeflection: { label: 'strDeflection', get options() { return t(DEFL, DEFL_IT); }, value: 1 },
    beta0: { label: '\\(\\beta_0\\)', min: 0.05, max: 2, step: 0.05, value: 1 },
    tau: { label: 'Volume \\(\\tau\\)', min: 0.1, max: 1, step: 0.05, value: 1 },
    gamma: { label: 'PrimalDual \\(\\gamma\\)', min: 0.2, max: 10, step: 0.2, value: 2 },
  },
  get explain() { return t('The subgradient method of SMS++ (Frangioni, Gorgone, Gendron 2017): a target-value step \\(\\nu = \\beta\\,(f(c) - f_{\\mathrm{lev}}) / \\|d\\|^2\\) along a deflected direction \\(d\\); Polyak uses a lower bound as target, ColorTV adapts \\(\\beta\\) by the colour of the iteration, FumeroTV moves the target between the lower bound and the record; Volume deflection mixes the new subgradient with the old direction and moves the centre only on serious steps; PrimalDual is dual averaging from the start.', "Il metodo del subgradiente di SMS++ (Frangioni, Gorgone, Gendron 2017): un passo a valore bersaglio \\(\\nu = \\beta\\,(f(c) - f_{\\mathrm{lev}}) / \\|d\\|^2\\) lungo una direzione deflessa \\(d\\); Polyak usa come bersaglio una limitazione inferiore, ColorTV adatta \\(\\beta\\) secondo il colore dell'iterazione, FumeroTV sposta il bersaglio fra la limitazione inferiore e il record; la deflessione Volume combina il nuovo subgradiente con la direzione precedente e sposta il centro solo nei passi seri; PrimalDual è il dual averaging fin dall'inizio."); },
  init(problem, p) {
    const s = start(problem, p);
    const o = s.trace[0];
    Object.assign(s, {
      fc: -o.value, d: null, eps: 0, nu: 0, beta: p.beta0,
      green: 0, yellow: 0, red: 0, fails: 0, r: 0, phase: 1, frec: -o.value,
      pd: { sum: [0, 0], delta: 0, bhat: 1, l0: s.lam },
    });
    return s;
  },
  step(problem, s, p) {
    const m = problem.lmax, last = s.trace.at(-1);
    const fi = -last.value, gi = [-last.subgradient[0], -last.subgradient[1]];
    const lb = -maxModel(s.cuts, m).value;            // a lower bound on f
    if (s.fc - lb < 1e-7 || s.k >= 80) { s.done = true; return s; }
    const rule = STEP[p.strStepsize];
    let lam;
    if (rule === 'PrimalDual') {
      // dual averaging (Nesterov 2009): simple averages, the centre never moves
      const pd = s.pd;
      pd.sum = [pd.sum[0] + gi[0], pd.sum[1] + gi[1]]; pd.delta += 1;
      const dbar = [pd.sum[0] / pd.delta, pd.sum[1] / pd.delta];
      const nu = pd.delta / (p.gamma * pd.bhat);
      pd.bhat += 1 / pd.bhat;
      lam = box([pd.l0[0] - nu / pd.delta * dbar[0] * pd.delta, pd.l0[1] - nu / pd.delta * dbar[1] * pd.delta], m);
    } else {
      // the deflection
      const sigma = Math.max(0, s.fc - (fi + dot(gi, [s.center[0] - last.lam[0], s.center[1] - last.lam[1]])));
      let alpha = 1;
      if (DEFL[p.strDeflection] === 'Volume' && s.d) {
        const gd = [gi[0] - s.d[0], gi[1] - s.d[1]], q = dot(gd, gd);
        if (q > 1e-14 && s.nu > 0) alpha = -(s.nu * dot(s.d, gd) + sigma - s.eps) / (s.nu * q);
        alpha = Math.min(p.tau, Math.max(p.tau / 10, alpha));
      }
      s.d = s.d ? [alpha * gi[0] + (1 - alpha) * s.d[0], alpha * gi[1] + (1 - alpha) * s.d[1]] : gi;
      s.eps = alpha * sigma + (1 - alpha) * s.eps;
      const nd = dot(s.d, s.d) || 1e-12;
      // the target level and the step
      let flev = lb;
      if (rule === 'ColorTV') flev = Math.max(lb, s.fc - 0.05 * Math.max(Math.abs(s.fc), 1));
      if (rule === 'FumeroTV') {
        const sg = Math.exp(-0.6933 * (s.r / 5) ** 3.26);
        flev = sg * lb + (1 - sg) * s.frec;
      }
      s.nu = rule === 'diminishing (not in SMS++)' ? p.beta0 / Math.sqrt(s.k + 1) / Math.sqrt(nd)
                                                   : s.beta * (s.fc - flev) / nd;
      lam = box([s.center[0] - s.nu * s.d[0], s.center[1] - s.nu * s.d[1]], m);
    }
    const o = problem.oracle(lam), fn = -o.value, gn = [-o.subgradient[0], -o.subgradient[1]];
    // the rules that adapt beta, on the outcome of the step
    const improved = fn < s.frec - 1e-9;
    if (rule === 'ColorTV' && s.d) {
      const rel = (s.fc - fn) / Math.max(Math.abs(s.fc), 1);
      if (dot(s.d, gn) > 0 && rel >= 1e-6) { s.green++; s.yellow = s.red = 0; if (s.green >= 1 && s.beta < 2) { s.beta *= 2; s.green = 0; } }
      else if (fn < s.fc) { s.yellow++; s.green = s.red = 0; if (s.yellow >= 400) { s.beta *= 1.1; s.yellow = 0; } }
      else { s.red++; s.green = s.yellow = 0; if (s.red >= 10 && s.beta > 5e-4) { s.beta *= 0.67; s.red = 0; } }
    }
    if (rule === 'FumeroTV') {
      if (improved) { s.fails = 0; if (s.phase === 2) s.beta *= 2; }
      else if (++s.fails >= 5) {
        s.fails = 0;
        if (s.phase === 1) { s.beta = s.beta / (2 * s.beta + 1); s.r++; if (Math.exp(-0.6933 * (s.r / 5) ** 3.26) < 1e-4) s.phase = 2; }
        else s.beta /= 2;
      }
    }
    s.frec = Math.min(s.frec, fn);
    // the centre moves on every step without deflection, on serious steps with it
    const deflected = rule !== 'PrimalDual' && DEFL[p.strDeflection] !== 'none';
    const serious = rule === 'PrimalDual' ? false : (!deflected || fn < s.fc - 1e-9);
    addColumn(s, problem, o);
    s.trace.push({ ...o, serious });
    if (serious && rule !== 'PrimalDual') {
      // the error of the direction, moved to the new centre
      if (s.d) s.eps = Math.max(0, s.eps + fn - s.fc - dot(s.d, [lam[0] - s.center[0], lam[1] - s.center[1]]));
      s.center = lam; s.fc = fn;
    }
    s.k++; s.lam = lam; s.best = Math.max(s.best, o.value);
    return s;
  },
};

// ----------------------------------------------------------------------------
// BundleSolver: the stabilizations intMPStbl, the t-strategies, the size of the
// bundle intBPar2 (2 is the poorman's bundle: the aggregate and the new item)
// ----------------------------------------------------------------------------

const STBL = ['0 kProximal', '1 kLevel', '2 kDoublyStabilized', '3 kNone (Kelley)', '4 kTrustRegion'];
const TSTRAT = ['fixed t', 'counts (intMnSSC, intMnNSC)', 'Heuristic1', 'Heuristic2', 'Heuristic3', 'Heuristic5', 'long-term soft', 'long-term hard', 'long-term balancing (default 12)', 'Heuristic4'];
const TSTRAT_IT = ['t fisso', 'conteggi (intMnSSC, intMnNSC)', 'Heuristic1', 'Heuristic2', 'Heuristic3', 'Heuristic5', 'a lungo termine, morbida', 'a lungo termine, rigida', 'a lungo termine, bilanciata (default 12)', 'Heuristic4'];
const BSIZE = [Infinity, 2, 5, 10];

export const bundleSolver = {
  name: 'BundleSolver (SMS++)',
  params: {
    ...startParams,
    intMPStbl: { label: 'intMPStbl', options: STBL, value: 0 },
    dbltInit: { label: 'dbltInit \\(t\\)', min: 0.02, max: 3, step: 0.02, value: 0.3 },
    dblm1: { label: 'dblm1', min: 0.01, max: 0.9, step: 0.01, value: 0.1 },
    tStrategy: { get label() { return t('t-strategy', "strategia di t"); }, get options() { return t(TSTRAT, TSTRAT_IT); }, value: 0 },
    endgame: { get label() { return t('endgame (+16)', "fase finale (+16)"); }, get options() { return t(['off', 'on'], ['no', 'sì']); }, value: 0 },
    intBPar2: { get label() { return t('intBPar2 (max size)', "intBPar2 (dim. massima)"); }, get options() { return t(['unbounded', '2 (poorman)', '5', '10'], ['illimitata', '2 (poorman)', '5', '10']); }, value: 0 },
    dblLStabM: { label: 'dblLStabM', min: 0.05, max: 0.95, step: 0.05, value: 0.5 },
  },
  get explain() { return t('The bundle method of SMS++ (Frangioni 2002): intMPStbl chooses the stabilization (proximal term, level constraint, both, none, i.e., Kelley, or a trust region \\(\\|\\lambda - c\\|_\\infty \\le t\\)); a serious step needs an increase of at least dblm1 times the predicted one; the t-strategy changes \\(t\\) on serious and null steps; intBPar2 bounds the bundle, aggregating the old items into one.', "Il metodo bundle di SMS++ (Frangioni 2002): intMPStbl sceglie la stabilizzazione (termine prossimale, vincolo di livello, entrambi, nessuna, cioè Kelley, o una regione di fiducia \\(\\|\\lambda - c\\|_\\infty \\le t\\)); un passo serio richiede un aumento pari ad almeno dblm1 volte quello previsto; la strategia di t cambia \\(t\\) nei passi seri e nei passi nulli; intBPar2 limita la dimensione del bundle, aggregando i vecchi elementi in uno solo."); },
  init(problem, p) {
    const s = start(problem, p);
    Object.assign(s, { t: p.dbltInit, ss: 0, ns: 0 });
    return s;
  },
  step(problem, s, p) {
    const m = problem.lmax, c = s.center, fc = problem.L(c), stbl = p.intMPStbl;
    const up = maxModel(s.cuts, m).value;
    if (up - s.best < 1e-7 || s.k >= 80) { s.done = true; return s; }
    const level = fc + (1 - p.dblLStabM) * (up - fc);
    let lam;
    if (stbl === 0) lam = proxMax(s.cuts, m, c, s.t).lam;
    else if (stbl === 1) lam = levelProject(s.cuts, m, c, level);
    else if (stbl === 2) {
      const pp = proxMax(s.cuts, m, c, s.t).lam;
      lam = modelAt(s.cuts, pp) >= level - 1e-12 ? pp : levelProject(s.cuts, m, c, level);
    } else if (stbl === 3) lam = maxModel(s.cuts, m).lam;
    else lam = maxModel(s.cuts, m, [Math.max(0, c[0] - s.t), Math.max(0, c[1] - s.t)], [Math.min(m, c[0] + s.t), Math.min(m, c[1] + s.t)]).lam;
    const mod = modelAt(s.cuts, lam), delta = mod - fc;
    if (delta < 1e-7 && stbl !== 3) { s.done = true; return s; }
    const o = problem.oracle(lam);
    const serious = stbl === 3 ? true : o.value - fc >= p.dblm1 * delta;
    addColumn(s, problem, o);
    s.trace.push({ ...o, serious, center: c });
    // the t-strategy
    if (serious) { s.ss++; s.ns = 0; } else { s.ns++; s.ss = 0; }
    const ts = TSTRAT[p.tStrategy], t0 = s.t;
    // the quantities of the heuristics of SMS++ (BundleSolver.cpp, Heuristic1-5),
    // in the terms of f = -L: d the step, z = d/t the aggregate subgradient, sigma
    // its linearization error at the centre, alpha1 that of the new item, g the
    // new subgradient of f
    const d = [lam[0] - c[0], lam[1] - c[1]], z = [d[0] / s.t, d[1] / s.t], zz = dot(z, z);
    const sigma = Math.max(0, mod - dot(d, d) / s.t - fc);
    const alpha1 = Math.max(1e-12, o.value + dot(o.subgradient, [c[0] - lam[0], c[1] - lam[1]]) - fc);
    const gd = -dot(o.subgradient, d), dF = fc - o.value;
    let tn = null;
    if (ts === 'Heuristic1') { const den = 2 * (dF + zz * s.t + sigma); if (den > 1e-14) tn = s.t * s.t * zz / den; }
    if (ts === 'Heuristic2') tn = s.t * (2 * alpha1 - gd) / (2 * alpha1);
    if (ts === 'Heuristic3') { const den = gd / s.t + zz; if (zz > 1e-14 && den > 1e-14) tn = s.t * zz / den; }
    // Heuristic4: the reversal form of the poorman's quasi-Newton update (Rey and
    // Sagastizabal), t + (<g, d> + t |z|^2) / (|g|^2 + 2 <g, d> / t + |z|^2)
    if (ts === 'Heuristic4') { const den = dot(o.subgradient, o.subgradient) + 2 * gd / s.t + zz; if (den > 1e-14) tn = s.t + (gd + s.t * zz) / den; }
    if (ts === 'Heuristic5') { const ng = Math.hypot(...o.subgradient), nd = Math.hypot(...d); if (ng > 1e-14 && nd > 1e-14) tn = s.t * Math.exp(-0.3 * gd / (ng * nd)); }
    if (tn !== null && isFinite(tn)) {
      // increases on serious steps within [1, 10] times t, decreases on null
      // steps (after intMnNSC = 3 of them) within [0.1, 1] times t
      if (serious) s.t = Math.min(10 * s.t, Math.max(s.t, tn));
      else if (s.ns >= 3) { s.t = Math.max(0.1 * s.t, Math.min(s.t, tn)); s.ns = 0; }
    }
    if (ts.startsWith('long-term balancing')) {
      // keep the two parts of the predicted increase comparable: the
      // displacement (t/2)|z|^2 and the linearization error sigma
      const D = s.t / 2 * zz;
      if (D > 10 * sigma && !serious) s.t = Math.max(1e-6, s.t * 0.5);
      else if (D < sigma / 10 && serious) s.t = Math.min(1e6, s.t * 2);
    } else if (ts.startsWith('counts') || ts.startsWith('long-term')) {
      // the long-term strategies watch the predicted increase v: soft does not
      // decrease t when v is small, hard increases it
      const small = delta < 1e-3 * Math.max(1, Math.abs(fc));
      if (serious && s.ss >= 1) s.t = Math.min(1e6, s.t * 2);
      if (!serious && s.ns >= 3) { if (!(ts === 'long-term soft' && small)) s.t = Math.max(1e-6, s.t * 0.5); s.ns = 0; }
      if (ts === 'long-term hard' && small) s.t = Math.min(1e6, s.t * 2);
    }
    // the endgame: when the displacement (t/2)|z|^2 is below a tenth of the
    // absolute accuracy (dblRelAcc 1e-6 times |f|), t is decreased by
    // (dblmxDecr + dblmnDecr) / 2 whatever the other strategies said
    if (p.endgame === 1 && stbl !== 1 && stbl !== 3 && s.t / 2 * zz < 1e-6 * Math.max(1, Math.abs(fc)) / 10) {
      s.t = Math.max(1e-6, t0 * (0.1 + 0.66) / 2); s.endgames = (s.endgames || 0) + 1;
    }
    if (stbl === 2 && serious) s.t *= 1.5;      // doubly stabilized: t grows on serious steps
    if (serious) s.center = lam;
    // the size of the bundle: beyond it, the items become one aggregate
    const max = BSIZE[p.intBPar2];
    if (s.cuts.length > max && (stbl === 0 || stbl === 2)) {
      const z = [(lam[0] - c[0]) / Math.max(s.t, 1e-9), (lam[1] - c[1]) / Math.max(s.t, 1e-9)];
      const agg = { value: mod - dot(z, lam), slope: z, aggregate: true };
      s.cuts = [agg, ...s.cuts.slice(-(max - 1))];
    }
    s.k++; s.lam = lam; s.best = Math.max(s.best, o.value);
    return s;
  },
};

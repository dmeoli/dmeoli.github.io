// The model of the Hebbian scene: the data of LAB2_1 of the course of
// Computational Neuroscience (github.com/dmeoli/ComputationalNeuroscience),
// a few other clouds, a single linear neuron v = w . u and the five rules of
// the lab with their parameters, their averaged dynamics and the objective
// that each one climbs. Points are [x, y] arrays, w is a Float64Array(2).

// the 100 points of lab2_1_data.csv, first row x, second row y
const LX = [0.74589, 0.43352, 0.34667, 0.43563, 0.87224, 0.91057, 0.53584, 0.34912, 0.54057, 0.46997, 0.70024, 0.77378, 0.82682, 0.14546, 0.68834, 0.35971, 0.81554, 0.48447, 0.29453, 0.64096, 0.45428, 0.63494, 0.37933, 0.23349, 0.90886, 0.43876, 0.33963, 0.41841, 0.42219, 0.25524, 0.5083, 0.84596, 0.14035, 0.39587, 0.63698, 0.3541, 0.68447, 0.33946, 0.55213, 0.79272, 0.63809, -0.0045443, 0.58915, 0.71341, 0.11595, 0.40112, 0.42337, 0.58805, 0.49308, 0.85059, -0.35406, -0.50244, -0.62183, -0.605, -0.95938, -0.72244, -0.49166, -0.37627, -0.82959, -0.64601, -0.37979, -0.61365, -0.9602, 0.077495, -0.26028, -0.71718, -0.94404, -0.41195, -0.71242, -0.62871, -0.10829, -0.56198, -0.19394, -0.51006, -0.23111, -0.42031, -0.61111, -0.11318, -0.26898, -0.30653, -0.79637, -0.39849, -0.38828, -0.2898, -0.61434, -0.67626, -0.24658, -0.20601, -0.51318, -0.69516, -0.10911, -0.28669, -0.7885, -0.92342, -0.72261, -0.68034, -0.95553, -0.21214, -0.50393, -0.92196];
const LY = [-0.43265, -0.53858, -0.35825, -0.95307, -0.59757, -0.7319, -0.75979, -0.31302, -0.56459, -0.97972, -0.38539, -0.29958, -0.64523, -0.23598, 0.28251, -0.10906, -0.74388, -0.79279, -0.70226, -0.2039, -0.53894, -0.40594, -0.12101, -0.51425, -0.57161, -0.16906, -0.66784, -0.61187, -0.42756, -0.59752, -0.81311, -0.31124, -0.92162, -1.0015, -0.75599, -0.47215, 0.015025, -0.43013, -0.54293, 0.093924, -0.27612, -0.46469, -0.41268, -0.56193, -0.4506, -0.74893, -0.48164, -0.66354, -0.43842, -0.61562, 0.41096, 0.19122, 0.85474, 0.10631, 0.16336, 0.18432, 0.49461, 0.35247, 0.54082, 0.79243, 0.61942, 0.80262, 0.3079, -0.1627, 0.1493, 0.51303, 0.57063, 0.073505, 0.8199, 0.15269, 0.46647, 0.14357, 0.79685, 0.39772, 0.53552, 0.41407, 0.50424, 0.73188, 0.52203, 0.98443, 0.70245, 0.77622, 0.39109, 0.67304, 0.67446, 0.32924, 0.42167, 0.43985, 0.58406, 0.087493, 0.65793, 0.87399, 0.78979, 0.59957, 0.85781, 0.5285, 1.0917, 0.48182, 0.026142, 0.52301];
export const LAB = LX.map((x, k) => [x, LY[k]]);

// a small seeded generator (mulberry32) and a standard normal
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const normal = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
export function permutation(n, r) {
  const p = Array.from({ length: n }, (_, k) => k);
  for (let k = n - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [p[k], p[j]] = [p[j], p[k]]; }
  return p;
}

// the clouds: wr is the half width of the plane of w drawn for the averaged dynamics
function gaussCloud(n, sx, sy, deg, mx, my, seed) {
  const r = rng(seed), c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
  return Array.from({ length: n }, () => { const a = sx * normal(r), b = sy * normal(r); return [mx + c * a - s * b, my + s * a + c * b]; });
}
export const CLOUDS = {
  lab: { pts: () => LAB, wr: 1.6 },
  gauss: { pts: () => gaussCloud(200, 0.7, 0.22, 0, 0, 0, 11), wr: 1.6 },
  rotated: { pts: () => gaussCloud(200, 0.55, 0.15, 60, 0.75, -0.2, 12), wr: 1.6 },
  clusters: { pts: () => [...gaussCloud(50, 0.12, 0.12, 0, 1.1, 0.25, 13), ...gaussCloud(50, 0.12, 0.12, 0, 0.25, 1.1, 14)], wr: 2.4 },
};

// eigen-decomposition of the symmetric [[a, b], [b, c]], largest eigenvalue first
export function eig2(a, b, c) {
  const m = (a + c) / 2, d = Math.hypot((a - c) / 2, b), l1 = m + d, l2 = m - d;
  let e1 = Math.abs(b) > 1e-14 ? [l1 - c, b] : a >= c ? [1, 0] : [0, 1];
  const n = Math.hypot(...e1); e1 = [e1[0] / n, e1[1] / n];
  // the sign of the lab's eig() on its data: second component positive
  if (e1[1] < 0 || (e1[1] === 0 && e1[0] < 0)) e1 = [-e1[0], -e1[1]];
  return { l1, l2, e1, e2: [-e1[1], e1[0]] };
}

// the data as the neuron sees them: centred or not, with the correlation
// matrix Q = <u u^T>, the covariance C, the mean and their eigenvectors
export function dataset(name, center) {
  const raw = CLOUDS[name].pts(), n = raw.length;
  const mean0 = [raw.reduce((s, p) => s + p[0], 0) / n, raw.reduce((s, p) => s + p[1], 0) / n];
  const pts = center ? raw.map(p => [p[0] - mean0[0], p[1] - mean0[1]]) : raw.map(p => [p[0], p[1]]);
  const mean = center ? [0, 0] : mean0;
  let qa = 0, qb = 0, qc = 0;
  for (const [x, y] of pts) { qa += x * x; qb += x * y; qc += y * y; }
  const Q = [qa / n, qb / n, qc / n];
  const C = [Q[0] - mean[0] ** 2, Q[1] - mean[0] * mean[1], Q[2] - mean[1] ** 2];
  return { name, center, pts, n, mean, Q, C, eigQ: eig2(...Q), eigC: eig2(...C), wr: CLOUDS[name].wr };
}

// the rules with the parameters of the lab (learning rate, epochs); BCM starts
// its threshold at -1 and moves it with the same rate as the weights
export const RULES = {
  hebb: { eta: 4e-4, epochs: 1000 },
  oja: { eta: 5e-4, epochs: 1000 },
  sub: { eta: 5e-4, epochs: 1000 },
  bcm: { eta: 5e-3, epochs: 2000, theta0: -1 },
  cov: { eta: 5e-3, epochs: 1000 },
};
export const ORDER = ['hebb', 'oja', 'sub', 'bcm', 'cov'];

// a run of one rule: o = { eta, alpha (Oja), mean (<u>, for the covariance rule) }
export function makeRun(rule, w0, o) {
  return { rule, w: Float64Array.from(w0), eta: o.eta, alpha: o.alpha ?? 1, mean: o.mean || [0, 0], theta: RULES[rule].theta0 ?? 0, v: 0, dw: [0, 0] };
}
// one point u: the output v = w . u and the update of w (and of theta for BCM)
export function apply(R, u) {
  const w = R.w, v = w[0] * u[0] + w[1] * u[1], e = R.eta;
  let d0, d1;
  switch (R.rule) {
    case 'hebb': d0 = v * u[0]; d1 = v * u[1]; break;
    case 'oja': d0 = v * (u[0] - R.alpha * v * w[0]); d1 = v * (u[1] - R.alpha * v * w[1]); break;
    case 'sub': { const s = (u[0] + u[1]) / 2; d0 = v * (u[0] - s); d1 = v * (u[1] - s); break; }   // n = (1, 1), N_u = 2
    case 'bcm': d0 = v * u[0] * (v - R.theta); d1 = v * u[1] * (v - R.theta); break;
    case 'cov': d0 = v * (u[0] - R.mean[0]); d1 = v * (u[1] - R.mean[1]); break;
  }
  w[0] += e * d0; w[1] += e * d1;
  if (R.rule === 'bcm') R.theta += e * (v * v - R.theta);
  R.v = v; R.dw = [e * d0, e * d1];
  return R;
}

// the averaged dynamics <dw>/eta over the data at w; BCM with theta = <v^2>
export function meanField(rule, w, D, alpha = 1) {
  const [qa, qb, qc] = D.Q, Qw = [qa * w[0] + qb * w[1], qb * w[0] + qc * w[1]];
  switch (rule) {
    case 'hebb': return Qw;
    case 'oja': { const q = w[0] * Qw[0] + w[1] * Qw[1]; return [Qw[0] - alpha * q * w[0], Qw[1] - alpha * q * w[1]]; }
    case 'sub': { const s = (Qw[0] + Qw[1]) / 2; return [Qw[0] - s, Qw[1] - s]; }
    case 'cov': { const [ca, cb, cc] = D.C; return [ca * w[0] + cb * w[1], cb * w[0] + cc * w[1]]; }
    case 'bcm': {
      let v2 = 0, a0 = 0, a1 = 0, b0 = 0, b1 = 0;
      for (const u of D.pts) { const v = w[0] * u[0] + w[1] * u[1]; v2 += v * v; a0 += v * v * u[0]; a1 += v * v * u[1]; b0 += v * u[0]; b1 += v * u[1]; }
      const n = D.n; v2 /= n;
      return [a0 / n - v2 * b0 / n, a1 / n - v2 * b1 / n];
    }
  }
}
// the objective whose gradient (projected, for Oja and the subtractive rule) is the averaged dynamics
export function objective(rule, w, D) {
  const [qa, qb, qc] = D.Q, q = qa * w[0] * w[0] + 2 * qb * w[0] * w[1] + qc * w[1] * w[1];
  switch (rule) {
    case 'hebb': case 'sub': return q / 2;
    case 'oja': { const n2 = w[0] * w[0] + w[1] * w[1]; return n2 > 1e-12 ? q / n2 : D.eigQ.l1; }
    case 'cov': { const [ca, cb, cc] = D.C; return (ca * w[0] * w[0] + 2 * cb * w[0] * w[1] + cc * w[1] * w[1]) / 2; }
    case 'bcm': {
      let m2 = 0, m3 = 0;
      for (const u of D.pts) { const v = w[0] * u[0] + w[1] * u[1]; m2 += v * v; m3 += v * v * v; }
      m2 /= D.n; m3 /= D.n;
      return m3 / 3 - m2 * m2 / 4;
    }
  }
}

// the angle in degrees between w and the line of the eigenvector e (0 to 90)
export function angle(w, e) {
  const n = Math.hypot(w[0], w[1]);
  return n > 0 ? Math.acos(Math.min(1, Math.abs(w[0] * e[0] + w[1] * e[1]) / n)) * 180 / Math.PI : 90;
}
export const norm = w => Math.hypot(w[0], w[1]);

// the lab's initialization, w uniform in [-1, 1]^2
export const initialW = seed => { const r = rng(seed * 2654435761 + 17); return [2 * r() - 1, 2 * r() - 1]; };

// the stream of the points, one permutation per epoch, shared by the runs of a race
export function stream(n, seed) {
  const r = rng(seed * 7919 + 3);
  let order = permutation(n, r), k = 0, epoch = 0;
  return {
    next() { if (k === n) { order = permutation(n, r); k = 0; epoch++; } return order[k++]; },
    get t() { return epoch * n + k; },
  };
}

// a whole run outside the page, for the checks: per epoch |w|, angle, theta
export function simulate(rule, D, { eta = RULES[rule].eta, epochs = RULES[rule].epochs, alpha = 1, seed = 1, w0 = initialW(seed) } = {}) {
  const R = makeRun(rule, w0, { eta, alpha, mean: D.mean }), S = stream(D.n, seed), hist = [];
  for (let ep = 0; ep < epochs; ep++) {
    for (let k = 0; k < D.n; k++) apply(R, D.pts[S.next()]);
    hist.push({ n: norm(R.w), ang: angle(R.w, D.eigQ.e1), theta: R.theta });
    if (!(norm(R.w) < 1e200)) break;
  }
  return { R, hist };
}

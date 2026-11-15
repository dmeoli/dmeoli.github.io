// The numerics of the state-space scene, shared by the page and its test:
// (1) a diagonal linear state space (S4D) with complex conjugate poles,
// discretized by zero-order hold and run both as a recurrence and as a
// convolution; (2) the HiPPO-LegS memory, whose state holds the Legendre
// coefficients of the whole past input; (3) a one-layer SSM whose step,
// input and output matrices may depend on the token (selective, as in Mamba)
// or not (time invariant), with its backward pass, Adam and the task
// "remember the token after the marker".

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// ------------------------------------------------------------ (1) S4D, LTI
// a pole is { re, im } with re < 0; each stands for itself and its conjugate,
// with B = C = 1, so that the output is real: y = 2 Re sum_n x_n.
// Zero-order hold with step dt: Abar = exp(dt l), Bbar = (exp(dt l) - 1) / l.
export function discretize(poles, dt) {
  return poles.map(({ re, im }) => {
    const m = Math.exp(dt * re), zr = m * Math.cos(dt * im), zi = m * Math.sin(dt * im);
    // (z - 1) / l, a complex division
    const nr = zr - 1, ni = zi, den = re * re + im * im;
    return { zr, zi, br: (nr * re + ni * im) / den, bi: (ni * re - nr * im) / den };
  });
}

// the recurrence x_k = Abar x_{k-1} + Bbar u_k, y_k = 2 Re sum_n x_{k,n};
// returns y and the states (states[k][n] = [re, im])
export function scan(D, u) {
  const L = u.length, y = new Float64Array(L), states = [];
  const xr = new Float64Array(D.length), xi = new Float64Array(D.length);
  for (let k = 0; k < L; k++) {
    let s = 0;
    const st = [];
    D.forEach((d, n) => {
      const r = d.zr * xr[n] - d.zi * xi[n] + d.br * u[k], i = d.zr * xi[n] + d.zi * xr[n] + d.bi * u[k];
      xr[n] = r; xi[n] = i; s += 2 * r; st.push([r, i]);
    });
    y[k] = s; states.push(st);
  }
  return { y, states };
}

// the kernel K_j = 2 Re sum_n Abar_n^j Bbar_n, j = 0..L-1
export function kernel(D, L) {
  const K = new Float64Array(L);
  for (const d of D) {
    let pr = d.br, pi = d.bi;
    for (let j = 0; j < L; j++) {
      K[j] += 2 * pr;
      const r = d.zr * pr - d.zi * pi; pi = d.zr * pi + d.zi * pr; pr = r;
    }
  }
  return K;
}

// the causal convolution y_k = sum_{j <= k} K_{k-j} u_j
export function convolve(K, u) {
  const L = u.length, y = new Float64Array(L);
  for (let k = 0; k < L; k++) { let s = 0; for (let j = 0; j <= k; j++) s += K[k - j] * u[j]; y[k] = s; }
  return y;
}

// the inputs of the first part, of length L
export function signal(kind, L, seed = 1) {
  const u = new Float64Array(L), r = rng(seed);
  if (kind === 'impulse') u[2] = 1;
  else if (kind === 'step') for (let k = 4; k < L; k++) u[k] = 1;
  else if (kind === 'noise') for (let k = 0; k < L; k++) u[k] = gauss(r) * 0.6;
  else for (const [k, v] of [[2, 1], [9, -0.7], [20, 1], [23, 1], [40, -1]]) if (k < L) u[k] = v;   // pulses
  return u;
}

// ------------------------------------------------------------ (2) HiPPO-LegS
// A_nk = sqrt(2n+1) sqrt(2k+1) (n > k), n + 1 (n = k), 0 (n < k); B_n = sqrt(2n+1).
// The ODE x'(t) = -(1/t) A x(t) + (1/t) B u(t) keeps in x(t) the coefficients of
// the projection of u on [0, t] onto the Legendre polynomials,
// u(s) ~ sum_n x_n(t) sqrt(2n+1) P_n(2 s / t - 1).
export function legsA(N) {
  const A = Array.from({ length: N }, () => new Float64Array(N));
  for (let n = 0; n < N; n++) for (let k = 0; k <= n; k++) A[n][k] = n > k ? Math.sqrt((2 * n + 1) * (2 * k + 1)) : n + 1;
  return A;
}

// the samples u_1..u_M at s = k / M; the scan with the bilinear rule, step 1/k
// in the scaled time: (I + A/(2k)) x_k = (I - A/(2k)) x_{k-1} + B u_k / k,
// solved by forward substitution (A is lower triangular). Returns M states.
export function legsScan(u, N) {
  const A = legsA(N), B = Float64Array.from({ length: N }, (_, n) => Math.sqrt(2 * n + 1));
  const M = u.length, X = [], x = new Float64Array(N), r = new Float64Array(N);
  for (let k = 1; k <= M; k++) {
    const h = 1 / (2 * k);
    for (let n = 0; n < N; n++) {
      let s = x[n];
      for (let j = 0; j <= n; j++) s -= h * A[n][j] * x[j];
      r[n] = s + B[n] * u[k - 1] / k;
    }
    for (let n = 0; n < N; n++) {
      let s = r[n];
      for (let j = 0; j < n; j++) s -= h * A[n][j] * x[j];
      x[n] = s / (1 + h * A[n][n]);
    }
    X.push(Float64Array.from(x));
  }
  return X;
}

// the Legendre polynomials P_0..P_{N-1} at z in [-1, 1]
export function legendre(N, z) {
  const P = new Float64Array(N);
  P[0] = 1; if (N > 1) P[1] = z;
  for (let n = 1; n + 1 < N; n++) P[n + 1] = ((2 * n + 1) * z * P[n] - n * P[n - 1]) / (n + 1);
  return P;
}

// the input on [0, t] read back from the state x(t), at G points
export function reconstruct(x, t, G) {
  const N = x.length, out = new Float64Array(G);
  for (let g = 0; g < G; g++) {
    const P = legendre(N, 2 * (g + 0.5) / G - 1);
    let s = 0; for (let n = 0; n < N; n++) s += x[n] * Math.sqrt(2 * n + 1) * P[n];
    out[g] = s;
  }
  return out;
}

// a smooth random input on [0, 1], M samples, or a few steps
export function history(kind, M, seed) {
  const r = rng(seed * 31 + 7), u = new Float64Array(M);
  if (kind === 'steps') {
    const cuts = [0, 0.18 + 0.1 * r(), 0.45 + 0.1 * r(), 0.7 + 0.1 * r(), 1.01], vals = cuts.map(() => 2 * r() - 1);
    for (let k = 0; k < M; k++) { const s = (k + 1) / M; let j = 0; while (s >= cuts[j + 1]) j++; u[k] = vals[j]; }
    return u;
  }
  const W = Array.from({ length: 5 }, (_, j) => ({ a: gauss(r) / (1 + j * 0.5), f: 0.5 + j * 1.1 + 0.5 * r(), ph: 2 * Math.PI * r() }));
  for (let k = 0; k < M; k++) { const s = (k + 1) / M; u[k] = W.reduce((v, w) => v + w.a * Math.sin(2 * Math.PI * w.f * s + w.ph), 0) * 0.6; }
  return u;
}

// ------------------------------------------------------------ (3) the task
// K colours (0..K-1) and the marker (K); a random sequence of colours of length
// L with one marker at p in [0, L-3]: the answer, read at the last step, is
// the colour at p + 1.
export const K = 4, MARK = K, V = K + 1;
export function sample(L, r) {
  const xs = Array.from({ length: L }, () => Math.floor(r() * K));
  const p = Math.floor(r() * (L - 2));
  xs[p] = MARK;
  return { xs, p, y: xs[p + 1] };
}

// ------------------------------------------------------------ (3) the model
// x_k = E0[u_k] + E1[u_{k-1}] (a causal convolution of width 2, as in front
// of the SSM of a Mamba block, here without its nonlinearity), D channels.
// Selective: Delta_k = softplus(Wd x_k + bd), B_k = Wb x_k + bb, C_k = Wc x_k + bc;
// time invariant: the same with Wd = Wb = Wc = 0 held fixed, so that Delta,
// B and C are the biases alone. Per channel d and state n, A_dn = -exp(Alog_dn),
//   a = exp(Delta_d A_dn),  bbar = (a - 1) / A_dn * B_n,
//   h_{k,d,n} = a h_{k-1,d,n} + bbar x_{k,d},   y_d = sum_n C_n h_{L-1,d,n},
// and the logits Wo y + bo at the last step.
export function makeModel(sel, D, N, seed) {
  const r = rng(seed), off = {};
  let n = 0;
  const add = (k, m) => { off[k] = n; n += m; };
  add('E0', V * D); add('E1', V * D); add('Alog', D * N); add('Wd', D * D); add('bd', D);
  add('Wb', N * D); add('bb', N); add('Wc', N * D); add('bc', N); add('Wo', K * D); add('bo', K);
  const p = new Float64Array(n), sz = { E0: V * D, E1: V * D, Alog: D * N, Wd: D * D, bd: D, Wb: N * D, bb: N, Wc: N * D, bc: N, Wo: K * D, bo: K };
  const fill = (k, f) => { for (let i = 0; i < sz[k]; i++) p[off[k] + i] = f(i); };
  fill('E0', () => gauss(r)); fill('E1', () => gauss(r));
  fill('Alog', i => Math.log(1 + (i % N)));
  const wd = gauss, s = 1 / Math.sqrt(D);
  // Delta at start log-uniform in [0.02, 0.2] (inverse softplus)
  fill('bd', () => { const d = Math.exp(Math.log(0.02) + r() * Math.log(10)); return Math.log(Math.expm1(d)); });
  fill('Wd', () => sel ? 0.5 * s * wd(r) : 0);
  fill('Wb', () => sel ? s * wd(r) : 0); fill('bb', () => gauss(r));
  fill('Wc', () => sel ? s * wd(r) : 0); fill('bc', () => gauss(r));
  fill('Wo', () => s * gauss(r)); fill('bo', () => 0);
  // the parameters trained: all for the selective model, all but Wd, Wb, Wc otherwise
  const mask = new Uint8Array(n).fill(1);
  if (!sel) for (const k of ['Wd', 'Wb', 'Wc']) mask.fill(0, off[k], off[k] + sz[k]);
  return { sel, D, N, n, p, g: new Float64Array(n), m: new Float64Array(n), v: new Float64Array(n), t: 0, off, mask };
}

const softplus = z => z > 20 ? z : Math.log1p(Math.exp(z));
const sigm = z => 1 / (1 + Math.exp(-z));

export function forward(M, xs, y) {
  const { D, N, p, off } = M, L = xs.length;
  const X = new Float64Array(L * D), Z = new Float64Array(L * D), Dt = new Float64Array(L * D), Bm = new Float64Array(L * N);
  const Aa = new Float64Array(L * D * N), Bb = new Float64Array(L * D * N), Hh = new Float64Array(L * D * N);
  const A = new Float64Array(D * N);
  for (let i = 0; i < D * N; i++) A[i] = -Math.exp(p[off.Alog + i]);
  for (let k = 0; k < L; k++) {
    for (let d = 0; d < D; d++) X[k * D + d] = p[off.E0 + xs[k] * D + d] + (k > 0 ? p[off.E1 + xs[k - 1] * D + d] : 0);
    for (let d = 0; d < D; d++) {
      let z = p[off.bd + d];
      for (let e = 0; e < D; e++) z += p[off.Wd + d * D + e] * X[k * D + e];
      Z[k * D + d] = z; Dt[k * D + d] = softplus(z);
    }
    for (let q = 0; q < N; q++) {
      let b = p[off.bb + q];
      for (let e = 0; e < D; e++) b += p[off.Wb + q * D + e] * X[k * D + e];
      Bm[k * N + q] = b;
    }
    for (let d = 0; d < D; d++) for (let q = 0; q < N; q++) {
      const i = (k * D + d) * N + q, Ad = A[d * N + q], dt = Dt[k * D + d];
      const a = Math.exp(dt * Ad), bb = Math.expm1(dt * Ad) / Ad * Bm[k * N + q];
      Aa[i] = a; Bb[i] = bb;
      Hh[i] = (k > 0 ? a * Hh[i - D * N] : 0) + bb * X[k * D + d];
    }
  }
  const last = L - 1, C = new Float64Array(N), Y = new Float64Array(D), lg = new Float64Array(K);
  for (let q = 0; q < N; q++) {
    let c = p[off.bc + q];
    for (let e = 0; e < D; e++) c += p[off.Wc + q * D + e] * X[last * D + e];
    C[q] = c;
  }
  for (let d = 0; d < D; d++) { let s = 0; for (let q = 0; q < N; q++) s += C[q] * Hh[(last * D + d) * N + q]; Y[d] = s; }
  let mx = -Infinity;
  for (let c = 0; c < K; c++) { let s = p[off.bo + c]; for (let d = 0; d < D; d++) s += p[off.Wo + c * D + d] * Y[d]; lg[c] = s; mx = Math.max(mx, s); }
  let se = 0; const P = new Float64Array(K);
  for (let c = 0; c < K; c++) { P[c] = Math.exp(lg[c] - mx); se += P[c]; }
  for (let c = 0; c < K; c++) P[c] /= se;
  const loss = y == null ? 0 : -Math.log(Math.max(P[y], 1e-300));
  return { X, Z, Dt, Bm, Aa, Bb, Hh, A, C, Y, P, loss, L };
}

// adds to M.g the gradient of the loss of one sequence
export function backward(M, xs, y, F) {
  const { D, N, p, g, off } = M, { L, X, Z, Dt, Bm, Aa, Bb, Hh, A, C, Y, P } = F, last = L - 1;
  const gY = new Float64Array(D);
  for (let c = 0; c < K; c++) {
    const gl = P[c] - (c === y ? 1 : 0);
    g[off.bo + c] += gl;
    for (let d = 0; d < D; d++) { g[off.Wo + c * D + d] += gl * Y[d]; gY[d] += gl * p[off.Wo + c * D + d]; }
  }
  const gX = new Float64Array(L * D), gA = new Float64Array(D * N);
  // C at the last step
  for (let q = 0; q < N; q++) {
    let gc = 0; for (let d = 0; d < D; d++) gc += gY[d] * Hh[(last * D + d) * N + q];
    g[off.bc + q] += gc;
    for (let e = 0; e < D; e++) { g[off.Wc + q * D + e] += gc * X[last * D + e]; gX[last * D + e] += gc * p[off.Wc + q * D + e]; }
  }
  const gH = new Float64Array(D * N);
  for (let d = 0; d < D; d++) for (let q = 0; q < N; q++) gH[d * N + q] = gY[d] * C[q];
  for (let k = last; k >= 0; k--) {
    const gDt = new Float64Array(D), gB = new Float64Array(N);
    for (let d = 0; d < D; d++) for (let q = 0; q < N; q++) {
      const i = (k * D + d) * N + q, gh = gH[d * N + q], a = Aa[i], Ad = A[d * N + q], dt = Dt[k * D + d], Bq = Bm[k * N + q];
      const hp = k > 0 ? Hh[i - D * N] : 0, x = X[k * D + d];
      const ga = gh * hp, gbb = gh * x;
      gX[k * D + d] += gh * Bb[i];
      // a = exp(dt A), bbar = expm1(dt A) / A * B
      gDt[d] += ga * a * Ad + gbb * Bq * a;
      gA[d * N + q] += ga * a * dt + gbb * Bq * (dt * a * Ad - Math.expm1(dt * Ad)) / (Ad * Ad);
      gB[q] += gbb * Math.expm1(dt * Ad) / Ad;
      gH[d * N + q] = gh * a;
    }
    for (let d = 0; d < D; d++) {
      const gz = gDt[d] * sigm(Z[k * D + d]);
      g[off.bd + d] += gz;
      for (let e = 0; e < D; e++) { g[off.Wd + d * D + e] += gz * X[k * D + e]; gX[k * D + e] += gz * p[off.Wd + d * D + e]; }
    }
    for (let q = 0; q < N; q++) {
      g[off.bb + q] += gB[q];
      for (let e = 0; e < D; e++) { g[off.Wb + q * D + e] += gB[q] * X[k * D + e]; gX[k * D + e] += gB[q] * p[off.Wb + q * D + e]; }
    }
  }
  for (let i = 0; i < D * N; i++) g[off.Alog + i] += gA[i] * A[i];
  for (let k = 0; k < L; k++) for (let d = 0; d < D; d++) {
    g[off.E0 + xs[k] * D + d] += gX[k * D + d];
    if (k > 0) g[off.E1 + xs[k - 1] * D + d] += gX[k * D + d];
  }
}

export function adam(M, lr, batch, b1 = 0.9, b2 = 0.999) {
  M.t++;
  const c1 = 1 - b1 ** M.t, c2 = 1 - b2 ** M.t;
  for (let i = 0; i < M.n; i++) {
    if (!M.mask[i]) { M.g[i] = 0; continue; }
    const gi = Math.max(-5, Math.min(5, M.g[i] / batch));
    M.m[i] = b1 * M.m[i] + (1 - b1) * gi; M.v[i] = b2 * M.v[i] + (1 - b2) * gi * gi;
    M.p[i] -= lr * (M.m[i] / c1) / (Math.sqrt(M.v[i] / c2) + 1e-8);
    M.g[i] = 0;
  }
}

export const argmax = a => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);

// a run: the selective and the time-invariant model, same seed, trained with
// Adam on the same minibatches, measured on a fixed test set
export const BATCH = 32, PER_STEP = 4, NTEST = 256;
export function createRun({ L, D, N, lr, seed }) {
  const tr = rng(seed * 977 + 3), br = rng(seed * 131 + 5);
  const run = {
    L, D, N, lr, epoch: 0,
    models: { sel: makeModel(true, D, N, seed * 7 + 1), lti: makeModel(false, D, N, seed * 7 + 1) },
    test: Array.from({ length: NTEST }, () => sample(L, tr)),
    hist: { sel: [], lti: [] },
  };
  run.trainStep = () => {
    for (let b = 0; b < PER_STEP; b++) {
      const batch = Array.from({ length: BATCH }, () => sample(L, br));
      for (const M of Object.values(run.models)) {
        for (const s of batch) backward(M, s.xs, s.y, forward(M, s.xs, s.y));
        adam(M, run.lr, BATCH);
      }
    }
    run.epoch++;
  };
  run.measure = () => {
    for (const [k, M] of Object.entries(run.models)) {
      let loss = 0, ok = 0;
      for (const s of run.test) { const F = forward(M, s.xs, s.y); loss += F.loss; if (argmax(F.P) === s.y) ok++; }
      run.hist[k].push({ epoch: run.epoch, loss: loss / NTEST, acc: ok / NTEST });
    }
  };
  // the accuracy of the best answer that ignores the order of the tokens: the
  // colour seen most often (ties shared), which a sum over the tokens can give
  run.majority = run.test.reduce((acc, s) => {
    const c = new Array(K).fill(0); for (const v of s.xs) if (v < K) c[v]++;
    const m = Math.max(...c), top = c.filter(v => v === m).length;
    return acc + (c[s.y] === m ? 1 / top : 0);
  }, 0) / NTEST;
  run.measure();
  return run;
}

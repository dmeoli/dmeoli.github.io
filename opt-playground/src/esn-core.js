// The computations of the echo state scene, in plain JavaScript: the
// benchmarks of LAB3_1 and LAB3_2 of github.com/dmeoli/ComputationalNeuroscience
// (NARMA10 and Mackey-Glass, generated here), a reservoir of N tanh units with
// its leak, the eigenvalues of its recurrent matrix (Hessenberg reduction and
// shifted QR, after elmhes and hqr of Numerical Recipes), the readout trained
// by ridge regression in closed form (Cholesky on the normal equations), the
// memory capacity, and the two networks the lab compares with the reservoir:
// an input delayed network (a tapped delay line into a tanh layer) and an
// Elman network trained by truncated backpropagation through time, both with
// Adam.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- the benchmarks
// NARMA10 as in the file NARMA10timeseries.mat of the course, which satisfies
// y(t) = 0.3 y(t-1) + 1.5 u(t-1) u(t-10) + 0.1 to the last digit (the term
// 0.05 y(t-1) sum_i y(t-i) of Atiya and Parlos is not in it), and the full
// recurrence of Atiya and Parlos (2000), both with y = 0 over the first 10 steps
export function narma(u, full = false) {
  const n = u.length, y = new Float64Array(n);
  for (let t = 10; t < n; t++) {
    let s = 0;
    if (full) for (let i = 1; i <= 10; i++) s += y[t - i];
    y[t] = 0.3 * y[t - 1] + (full ? 0.05 * y[t - 1] * s : 0) + 1.5 * u[t - 1] * u[t - 10] + 0.1;
  }
  return y;
}
// the input of NARMA10: uniform in [0, 0.5], as in the course file
export function narmaInput(n, seed) {
  const r = rng(seed), u = new Float64Array(n);
  for (let t = 0; t < n; t++) u[t] = 0.5 * r();
  return u;
}
// Mackey-Glass, dz/dt = 0.2 z(t-17) / (1 + z(t-17)^10) - 0.1 z(t), by Euler
// with 10 steps per unit of time, sampled at every unit and squashed as
// tanh(z - 1); the file MGtimeseries.mat of the course is this series (its
// atanh(.) + 1 fits the delay equation with tau = 17, see tests/esn.html).
// The history is constant at 1.2 plus a small perturbation drawn from the
// seed, and the first `skip` units are dropped.
export function mackeyGlass(n, seed = 1, skip = 1000, sub = 10) {
  const K = 17 * sub, dt = 1 / sub, r = rng(seed), out = new Float64Array(n);
  const len = (n + skip) * sub + K + 1, z = new Float64Array(len);
  for (let i = 0; i <= K; i++) z[i] = 1.2 + 0.05 * (r() - 0.5);
  for (let i = K; i < len - 1; i++) {
    const d = z[i - K];
    z[i + 1] = z[i] + dt * (0.2 * d / (1 + d ** 10) - 0.1 * z[i]);
  }
  for (let k = 0; k < n; k++) out[k] = Math.tanh(z[K + (skip + k) * sub] - 1);
  return out;
}
// the three tasks, as the lab splits them: the design set is the first 5000
// steps (the readout is trained on it after the washout), the test set the rest
export const BENCH = {
  narma: { name: ['NARMA10 (course file)', 'NARMA10 (file del corso)'] },
  narmafull: { name: ['NARMA10 (Atiya and Parlos)', 'NARMA10 (Atiya e Parlos)'] },
  mg: { name: ['Mackey-Glass, one step ahead', 'Mackey-Glass, un passo avanti'] },
};
export const DESIGN = 5000;
export function makeTask(kind, seed = 1, n = 10000) {
  if (kind === 'mg') {
    const s = mackeyGlass(n, seed);
    return { kind, u: s.subarray(0, n - 1), y: s.subarray(1, n) };
  }
  const u = narmaInput(n, seed);
  return { kind, u, y: narma(u, kind === 'narmafull') };
}

// ----------------------------------------------------------------- the reservoir
// W_in has a column for the bias and one for u, uniform in [-1, 1] as in the
// lab (U = 2 rand(Nr, Nu + 1) - 1); W uniform in [-1, 1] on a fraction `conn`
// of its entries, zero elsewhere. The raw matrices are kept, scaled at use by
// the input scaling and by rho / (spectral radius of the raw W).
export function makeReservoir(N, conn, seed) {
  const r = rng(seed * 7919 + N), W = new Float64Array(N * N), Win = new Float64Array(N * 2);
  for (let k = 0; k < 2 * N; k++) Win[k] = 2 * r() - 1;
  for (let i = 0; i < N; i++) {
    let any = false;
    for (let j = 0; j < N; j++) if (conn >= 1 || r() < conn) { W[i * N + j] = 2 * r() - 1; any = true; }
    if (!any) W[i * N + Math.floor(r() * N)] = 2 * r() - 1;   // no unit without inputs
  }
  const ev = eig(W, N);
  let rad = 0;
  for (let k = 0; k < N; k++) rad = Math.max(rad, Math.hypot(ev.re[k], ev.im[k]));
  // the sparse rows, used when they save work
  const rows = [];
  let nnz = 0;
  for (let i = 0; i < N; i++) { const c = []; for (let j = 0; j < N; j++) if (W[i * N + j] !== 0) c.push(j); rows.push(Int32Array.from(c)); nnz += c.length; }
  return { N, conn, seed, W, Win, ev, rad, rows, nnz };
}

// x(t) = (1 - a) x(t-1) + a tanh(W_in [1; u(t)] + W x(t-1)), from x0 (zeros by
// default); returns the states, one row of N per step, in a Float32Array
export function runReservoir(res, p, u, x0 = null, T = u.length) {
  const { N, W, Win, rows } = res, g = p.rho / res.rad, om = p.omega, a = p.leak;
  const X = new Float32Array(T * N), x = x0 ? Float64Array.from(x0) : new Float64Array(N), nx = new Float64Array(N);
  const sparse = res.nnz < 0.5 * N * N;
  for (let t = 0; t < T; t++) {
    const ut = u[t];
    for (let i = 0; i < N; i++) {
      let s = 0;
      const o = i * N;
      if (sparse) { const c = rows[i]; for (let q = 0; q < c.length; q++) s += W[o + c[q]] * x[c[q]]; }
      else for (let j = 0; j < N; j++) s += W[o + j] * x[j];
      nx[i] = (1 - a) * x[i] + a * Math.tanh(om * (Win[2 * i] + Win[2 * i + 1] * ut) + g * s);
    }
    x.set(nx); X.set(nx, t * N);
  }
  return X;
}

// the distance between two runs on the same input, one from x = 0 and one from
// a random state in [-1, 1]^N, at every step
export function echoDistance(res, p, u, T, seed = 3) {
  const N = res.N, r = rng(seed), x0 = new Float64Array(N);
  for (let i = 0; i < N; i++) x0[i] = 2 * r() - 1;
  const A = runReservoir(res, p, u, null, T), B = runReservoir(res, p, u, x0, T), d = new Float64Array(T + 1);
  d[0] = Math.hypot(...x0);
  for (let t = 0; t < T; t++) { let s = 0; for (let i = 0; i < N; i++) { const e = A[t * N + i] - B[t * N + i]; s += e * e; } d[t + 1] = Math.sqrt(s); }
  return d;
}

// ------------------------------------------------------------------ the readout
// the Gram matrix of the extended states [1; x(t)] over the steps [t0, t1) and
// their products with the target: A = X X^T and b = X y^T, as in
// W_out = Y X^T (X X^T + lambda I)^{-1}
export function gram(X, N, y, t0, t1) {
  const M = N + 1, A = new Float64Array(M * M), b = new Float64Array(M), z = new Float64Array(M);
  z[0] = 1;
  for (let t = t0; t < t1; t++) {
    for (let i = 0; i < N; i++) z[i + 1] = X[t * N + i];
    const yt = y[t];
    for (let i = 0; i < M; i++) {
      const zi = z[i];
      if (zi === 0) continue;
      b[i] += zi * yt;
      const o = i * M;
      for (let j = i; j < M; j++) A[o + j] += zi * z[j];
    }
  }
  for (let i = 0; i < M; i++) for (let j = 0; j < i; j++) A[i * M + j] = A[j * M + i];
  return { A, b, M, n: t1 - t0 };
}
// Cholesky factor of A + lambda I (lower, in place of a copy)
export function cholesky(A, M, lam) {
  const L = Float64Array.from(A);
  for (let i = 0; i < M; i++) L[i * M + i] += lam;
  for (let j = 0; j < M; j++) {
    let d = L[j * M + j];
    for (let k = 0; k < j; k++) d -= L[j * M + k] ** 2;
    if (!(d > 0)) d = 1e-300;
    const s = Math.sqrt(d);
    L[j * M + j] = s;
    for (let i = j + 1; i < M; i++) {
      let v = L[i * M + j];
      for (let k = 0; k < j; k++) v -= L[i * M + k] * L[j * M + k];
      L[i * M + j] = v / s;
    }
  }
  return L;
}
export function cholSolve(L, M, b) {
  const x = Float64Array.from(b);
  for (let i = 0; i < M; i++) { let v = x[i]; for (let k = 0; k < i; k++) v -= L[i * M + k] * x[k]; x[i] = v / L[i * M + i]; }
  for (let i = M - 1; i >= 0; i--) { let v = x[i]; for (let k = i + 1; k < M; k++) v -= L[k * M + i] * x[k]; x[i] = v / L[i * M + i]; }
  return x;
}
export const ridge = (G, lam) => cholSolve(cholesky(G.A, G.M, lam), G.M, G.b);
export function predict(X, N, w) {
  const T = X.length / N, y = new Float64Array(T);
  for (let t = 0; t < T; t++) { let s = w[0]; for (let i = 0; i < N; i++) s += w[i + 1] * X[t * N + i]; y[t] = s; }
  return y;
}
export function errors(y, yh, t0, t1) {
  let m = 0, s = 0, q = 0;
  for (let t = t0; t < t1; t++) m += y[t];
  m /= t1 - t0;
  for (let t = t0; t < t1; t++) { s += (yh[t] - y[t]) ** 2; q += (y[t] - m) ** 2; }
  return { mse: s / (t1 - t0), nmse: s / q };
}

// the memory capacity: on an i.i.d. input uniform in [-0.8, 0.8], one readout
// per delay k trained to give back u(t-k) (2000 steps after a washout of 200),
// and MC_k = r^2(u(t-k), y_k(t)) on 1000 further steps
export function memoryCapacity(res, p, K, lam = 1e-6, seed = 5) {
  const N = res.N, W0 = 200, TR = 2000, TE = 1000, T = W0 + TR + TE, r = rng(seed), u = new Float64Array(T);
  for (let t = 0; t < T; t++) u[t] = 1.6 * r() - 0.8;
  const X = runReservoir(res, p, u);
  const G = gram(X, N, u, W0, W0 + TR), L = cholesky(G.A, G.M, lam), M = N + 1, mc = new Float64Array(K + 1);
  for (let k = 1; k <= K; k++) {
    const b = new Float64Array(M);
    for (let t = W0; t < W0 + TR; t++) { b[0] += u[t - k]; for (let i = 0; i < N; i++) b[i + 1] += X[t * N + i] * u[t - k]; }
    const w = cholSolve(L, M, b);
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let t = W0 + TR; t < T; t++) {
      let yk = w[0];
      for (let i = 0; i < N; i++) yk += w[i + 1] * X[t * N + i];
      const a = u[t - k];
      sa += a; sb += yk; saa += a * a; sbb += yk * yk; sab += a * yk;
    }
    const cov = sab / TE - sa * sb / TE / TE, va = saa / TE - (sa / TE) ** 2, vb = sbb / TE - (sb / TE) ** 2;
    mc[k] = vb > 0 ? cov * cov / (va * vb) : 0;
  }
  return mc;
}

// --------------------------------------------------------------- eigenvalues
// all the eigenvalues of a real n x n matrix (row major, not changed):
// elmhes (Gaussian elimination with pivoting to upper Hessenberg form) and
// hqr (Francis double shift QR), Numerical Recipes in C, 2nd ed., section 11.5-6
export function eig(A0, n) {
  const a = Float64Array.from(A0), A = (i, j) => (i - 1) * n + (j - 1);
  for (let m = 2; m < n; m++) {
    let x = 0, i = m;
    for (let j = m; j <= n; j++) if (Math.abs(a[A(j, m - 1)]) > Math.abs(x)) { x = a[A(j, m - 1)]; i = j; }
    if (i !== m) {
      for (let j = m - 1; j <= n; j++) { const s = a[A(i, j)]; a[A(i, j)] = a[A(m, j)]; a[A(m, j)] = s; }
      for (let j = 1; j <= n; j++) { const s = a[A(j, i)]; a[A(j, i)] = a[A(j, m)]; a[A(j, m)] = s; }
    }
    if (x) {
      for (i = m + 1; i <= n; i++) {
        let y = a[A(i, m - 1)];
        if (y !== 0) {
          y /= x; a[A(i, m - 1)] = y;
          for (let j = m; j <= n; j++) a[A(i, j)] -= y * a[A(m, j)];
          for (let j = 1; j <= n; j++) a[A(j, m)] += y * a[A(j, i)];
        }
      }
    }
  }
  for (let i = 3; i <= n; i++) for (let j = 1; j < i - 1; j++) a[A(i, j)] = 0;
  const wr = new Float64Array(n + 1), wi = new Float64Array(n + 1);
  const sign = (u, v) => (v >= 0 ? Math.abs(u) : -Math.abs(u));
  let anorm = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[A(i, j)]);
  let nn = n, t = 0, l, m, p = 0, q = 0, r = 0, s, w, x, y, z;
  while (nn >= 1) {
    let its = 0;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[A(l - 1, l - 1)]) + Math.abs(a[A(l, l)]);
        if (s === 0) s = anorm;
        if (Math.abs(a[A(l, l - 1)]) + s === s) { a[A(l, l - 1)] = 0; break; }
      }
      x = a[A(nn, nn)];
      if (l === nn) { wr[nn] = x + t; wi[nn--] = 0; }
      else {
        y = a[A(nn - 1, nn - 1)];
        w = a[A(nn, nn - 1)] * a[A(nn - 1, nn)];
        if (l === nn - 1) {
          p = 0.5 * (y - x); q = p * p + w; z = Math.sqrt(Math.abs(q)); x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('eig: too many iterations');
          if (its === 10 || its === 20 || its === 40) {
            t += x;
            for (let i = 1; i <= nn; i++) a[A(i, i)] -= x;
            s = Math.abs(a[A(nn, nn - 1)]) + Math.abs(a[A(nn - 1, nn - 2)]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          for (m = nn - 2; m >= l; m--) {
            z = a[A(m, m)];
            r = x - z; s = y - z;
            p = (r * s - w) / a[A(m + 1, m)] + a[A(m, m + 1)];
            q = a[A(m + 1, m + 1)] - z - r - s;
            r = a[A(m + 2, m + 1)];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s; q /= s; r /= s;
            if (m === l) break;
            const u = Math.abs(a[A(m, m - 1)]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[A(m - 1, m - 1)]) + Math.abs(z) + Math.abs(a[A(m + 1, m + 1)]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) { a[A(i, i - 2)] = 0; if (i !== m + 2) a[A(i, i - 3)] = 0; }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[A(k, k - 1)]; q = a[A(k + 1, k - 1)]; r = 0;
              if (k !== nn - 1) r = a[A(k + 2, k - 1)];
              if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) { p /= x; q /= x; r /= x; }
            }
            if ((s = sign(Math.sqrt(p * p + q * q + r * r), p)) !== 0) {
              if (k === m) { if (l !== m) a[A(k, k - 1)] = -a[A(k, k - 1)]; }
              else a[A(k, k - 1)] = -s * x;
              p += s; x = p / s; y = q / s; z = r / s; q /= p; r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[A(k, j)] + q * a[A(k + 1, j)];
                if (k !== nn - 1) { p += r * a[A(k + 2, j)]; a[A(k + 2, j)] -= p * z; }
                a[A(k + 1, j)] -= p * y; a[A(k, j)] -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[A(i, k)] + y * a[A(i, k + 1)];
                if (k !== nn - 1) { p += z * a[A(i, k + 2)]; a[A(i, k + 2)] -= p * r; }
                a[A(i, k + 1)] -= p * q; a[A(i, k)] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return { re: wr.subarray(1), im: wi.subarray(1) };
}

// ------------------------------------------------- the networks of LAB3_1
// both read the input and give the target standardized (as MATLAB maps them
// into [-1, 1]), and are trained on the design set with Adam, minibatches and
// a gradient clipped to norm 1; their errors are in the units of the target
function adam(net, lr) {
  const { p, g, m, v } = net, b1 = 0.9, b2 = 0.999;
  let nrm = 0;
  for (let k = 0; k < p.length; k++) nrm += g[k] * g[k];
  const c = Math.min(1, 1 / Math.sqrt(nrm + 1e-30));
  net.t++;
  const s1 = 1 - b1 ** net.t, s2 = 1 - b2 ** net.t;
  for (let k = 0; k < p.length; k++) {
    const gk = g[k] * c;
    m[k] = b1 * m[k] + (1 - b1) * gk; v[k] = b2 * v[k] + (1 - b2) * gk * gk;
    p[k] -= lr * (m[k] / s1) / (Math.sqrt(v[k] / s2) + 1e-8);
  }
}
function moments(a, t0, t1) {
  let m = 0, q = 0;
  for (let t = t0; t < t1; t++) m += a[t];
  m /= t1 - t0;
  for (let t = t0; t < t1; t++) q += (a[t] - m) ** 2;
  return [m, Math.sqrt(q / (t1 - t0)) || 1];
}
function params(n) { return { p: new Float64Array(n), g: new Float64Array(n), m: new Float64Array(n), v: new Float64Array(n), t: 0 }; }

// the input delayed network: y(t) = v . tanh(A [u(t), ..., u(t-d+1)] + b) + c
export function makeIDNN(task, d, H, seed, lr = 0.003) {
  const [mu, su] = moments(task.u, 0, DESIGN), [my, sy] = moments(task.y, 0, DESIGN);
  const n = H * d + H + H + 1, net = { kind: 'idnn', d, H, lr, mu, su, my, sy, epoch: 0, ...params(n) };
  const r = rng(seed * 31 + 7), sa = Math.sqrt(3 / d), sv = Math.sqrt(3 / H);
  for (let k = 0; k < H * d; k++) net.p[k] = (2 * r() - 1) * sa;
  for (let k = H * d + H; k < H * d + 2 * H; k++) net.p[k] = (2 * r() - 1) * sv;
  net.u = Float64Array.from(task.u, x => (x - mu) / su);
  net.y = Float64Array.from(task.y, x => (x - my) / sy);
  net.order = Int32Array.from({ length: DESIGN - 10 }, (_, k) => k + 10);
  net.r = rng(seed * 97 + 3);
  return net;
}
function idnnOut(net, t, h) {
  const { d, H, p, u } = net, ob = H * d, ov = ob + H;
  let y = p[ov + H];
  for (let j = 0; j < H; j++) {
    let s = p[ob + j];
    for (let k = 0; k < d; k++) s += p[j * d + k] * (t - k >= 0 ? u[t - k] : 0);
    h[j] = Math.tanh(s); y += p[ov + j] * h[j];
  }
  return y;
}
// the gradient of the mean squared error over the steps ts into net.g; the loss
export function idnnGrad(net, ts) {
  const { d, H, p, g, u, y } = net, ob = H * d, ov = ob + H, h = new Float64Array(H), nb = ts.length;
  g.fill(0);
  let loss = 0;
  for (const t of ts) {
    const r = idnnOut(net, t, h) - y[t], e = 2 * r / nb;
    loss += r * r / nb;
    g[ov + H] += e;
    for (let j = 0; j < H; j++) {
      g[ov + j] += e * h[j];
      const da = e * p[ov + j] * (1 - h[j] * h[j]);
      g[ob + j] += da;
      for (let k = 0; k < d; k++) g[j * d + k] += da * (t - k >= 0 ? u[t - k] : 0);
    }
  }
  return loss;
}
export function idnnEpoch(net, B = 32) {
  const { order, r } = net;
  for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)), s = order[k]; order[k] = order[j]; order[j] = s; }
  for (let b0 = 0; b0 < order.length; b0 += B) { idnnGrad(net, order.subarray(b0, Math.min(order.length, b0 + B))); adam(net, net.lr); }
  net.epoch++;
}
export function idnnPredict(net) {
  const T = net.u.length, out = new Float64Array(T), h = new Float64Array(net.H);
  for (let t = 0; t < T; t++) out[t] = idnnOut(net, t, h) * net.sy + net.my;
  return out;
}

// the Elman network: h(t) = tanh(a u(t) + W h(t-1) + b), y(t) = v . h(t) + c,
// trained by backpropagation through time on consecutive chunks of L steps of
// the design set, the state carried from one chunk to the next
export function makeRNN(task, H, seed, lr = 0.002, L = 40) {
  const [mu, su] = moments(task.u, 0, DESIGN), [my, sy] = moments(task.y, 0, DESIGN);
  const n = H + H * H + H + H + 1, net = { kind: 'rnn', H, L, lr, mu, su, my, sy, epoch: 0, ...params(n) };
  // layout: a (H), W (H x H), b (H), v (H), c
  const r = rng(seed * 53 + 11), sw = 0.9 * Math.sqrt(3 / H), sv = Math.sqrt(3 / H);
  for (let j = 0; j < H; j++) net.p[j] = 2 * r() - 1;
  for (let k = H; k < H + H * H; k++) net.p[k] = (2 * r() - 1) * sw;
  for (let k = 2 * H + H * H; k < 3 * H + H * H; k++) net.p[k] = (2 * r() - 1) * sv;
  net.u = Float64Array.from(task.u, x => (x - mu) / su);
  net.y = Float64Array.from(task.y, x => (x - my) / sy);
  return net;
}
// the gradient, into net.g, of the mean squared error over the L steps from t0,
// starting from the state h0 (H values, not changed); the loss, and the last
// state in hs
export function rnnGrad(net, t0, h0, hs = new Float64Array((net.L + 1) * net.H)) {
  const { H, L, p, g, u, y } = net, oW = H, ob = H + H * H, ov = ob + H, oc = ov + H;
  const dh = new Float64Array(H), dn = new Float64Array(H), e = new Float64Array(L);
  hs.set(h0);
  let loss = 0;
  for (let s = 0; s < L; s++) {
    const t = t0 + s, ho = s * H, hn = (s + 1) * H;
    let yo = p[oc];
    for (let i = 0; i < H; i++) {
      let a = p[i] * u[t] + p[ob + i];
      const o = oW + i * H;
      for (let j = 0; j < H; j++) a += p[o + j] * hs[ho + j];
      hs[hn + i] = Math.tanh(a); yo += p[ov + i] * hs[hn + i];
    }
    e[s] = 2 * (yo - y[t]) / L; loss += (yo - y[t]) ** 2 / L;
  }
  g.fill(0);
  for (let s = L - 1; s >= 0; s--) {
    const t = t0 + s, ho = s * H, hn = (s + 1) * H;
    g[oc] += e[s];
    for (let i = 0; i < H; i++) { g[ov + i] += e[s] * hs[hn + i]; dh[i] = e[s] * p[ov + i] + dn[i]; }
    dn.fill(0);
    for (let i = 0; i < H; i++) {
      const da = dh[i] * (1 - hs[hn + i] ** 2);
      if (da === 0) continue;
      g[i] += da * u[t]; g[ob + i] += da;
      const o = oW + i * H;
      for (let j = 0; j < H; j++) { g[o + j] += da * hs[ho + j]; dn[j] += da * p[o + j]; }
    }
  }
  return loss;
}
export function rnnEpoch(net) {
  const { H, L } = net, hs = new Float64Array((L + 1) * H);
  let h0 = new Float64Array(H);
  for (let t0 = 10; t0 + L <= DESIGN; t0 += L) {
    rnnGrad(net, t0, h0, hs);
    adam(net, net.lr);
    h0 = hs.slice(L * H, (L + 1) * H);
  }
  net.epoch++;
}
export function rnnPredict(net) {
  const { H, p, u } = net, oW = H, ob = H + H * H, ov = ob + H, oc = ov + H, T = u.length, out = new Float64Array(T);
  let h = new Float64Array(H), hn = new Float64Array(H);
  for (let t = 0; t < T; t++) {
    let yo = p[oc];
    for (let i = 0; i < H; i++) {
      let a = p[i] * u[t] + p[ob + i];
      const o = oW + i * H;
      for (let j = 0; j < H; j++) a += p[o + j] * h[j];
      hn[i] = Math.tanh(a); yo += p[ov + i] * hn[i];
    }
    [h, hn] = [hn, h];
    out[t] = yo * net.sy + net.my;
  }
  return out;
}

// The model of the scene P: the noise schedule of a DDPM, a small MLP that
// predicts the noise from a point and a sinusoidal embedding of the time, its
// backward pass and Adam, and the reverse process (DDPM ancestral sampling, and
// DDIM, deterministic, on all the steps or on a stride of them). Everything in
// plain Float64Arrays, so that it trains in the page.

// ------------------------------------------------------------------ random numbers
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const gauss = r => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

// ------------------------------------------------------------------ schedule
// beta[t], alpha[t] = 1 - beta[t] and abar[t] = prod_{s <= t} alpha[s] for
// t = 1..T, with abar[0] = 1. Linear: the discretization of the VP SDE of Song
// et al. (2021), beta from 0.1/T to 20/T, so that abar[T] is about e^-10 for
// every T; cosine: Nichol and Dhariwal (2021), beta clipped at 0.999.
export function schedule(kind, T) {
  const beta = new Float64Array(T + 1), alpha = new Float64Array(T + 1), abar = new Float64Array(T + 1);
  const f = t => Math.cos((t / T + 0.008) / 1.008 * Math.PI / 2) ** 2;
  for (let t = 1; t <= T; t++)
    beta[t] = kind === 'cosine' ? Math.min(0.999, 1 - f(t) / f(t - 1))
                                : (0.1 + (t - 1) / Math.max(1, T - 1) * 19.9) / T;
  abar[0] = 1;
  for (let t = 1; t <= T; t++) { alpha[t] = 1 - beta[t]; abar[t] = abar[t - 1] * alpha[t]; }
  return { kind, T, beta, alpha, abar };
}

// x_t = sqrt(abar_t) x_0 + sqrt(1 - abar_t) eps, for n points at once
export function noisy(sc, x0, t, eps, out = new Float64Array(x0.length)) {
  const a = Math.sqrt(sc.abar[t]), s = Math.sqrt(1 - sc.abar[t]);
  for (let i = 0; i < x0.length; i++) out[i] = a * x0[i] + s * eps[i];
  return out;
}

// ------------------------------------------------------------------ the network
// input: the point and EMB sinusoids of s = t/T, frequencies from 1 to 100
export const EMB = 16;
const FREQ = Array.from({ length: EMB / 2 }, (_, k) => 100 ** (k / (EMB / 2 - 1)));
function embed(t, T, a) {
  const s = t / T;
  for (let k = 0; k < EMB / 2; k++) { a[2 + 2 * k] = Math.sin(FREQ[k] * s); a[3 + 2 * k] = Math.cos(FREQ[k] * s); }
}

// SiLU in the hidden layers, linear output of size 2
export function makeNet(width, depth, seed = 1) {
  const sizes = [2 + EMB, ...Array(depth).fill(width), 2], r = mulberry(seed * 7919 + 13), W = [], b = [];
  for (let l = 0; l + 1 < sizes.length; l++) {
    const n = sizes[l], m = sizes[l + 1], s = Math.sqrt(1 / n);
    W.push(Float64Array.from({ length: m * n }, () => s * gauss(r)));
    b.push(new Float64Array(m));
  }
  const buf = () => sizes.map(n => new Float64Array(n));
  return { sizes, W, b, z: buf(), a: buf(), d: buf() };
}
export const zeroGrads = net => ({ W: net.W.map(w => new Float64Array(w.length)), b: net.b.map(v => new Float64Array(v.length)) });

const sig = z => 1 / (1 + Math.exp(-z));

// the predicted noise at (x, y) and time t; it stays in net.a.at(-1)
export function forward(net, x, y, t, T) {
  const { sizes, W, b, z, a } = net, L = sizes.length - 1;
  a[0][0] = x; a[0][1] = y; embed(t, T, a[0]);
  for (let l = 0; l < L; l++) {
    const n = sizes[l], m = sizes[l + 1], w = W[l], inp = a[l], zz = z[l + 1], out = a[l + 1], last = l + 1 === L;
    for (let i = 0; i < m; i++) {
      let s = b[l][i];
      for (let j = 0, o = i * n; j < n; j++) s += w[o + j] * inp[j];
      zz[i] = s; out[i] = last ? s : s * sig(s);
    }
  }
  return a[L];
}

// adds to G the gradient of gx * out_x + gy * out_y, after a forward
export function backward(net, gx, gy, G) {
  const { sizes, W, z, a, d } = net, L = sizes.length - 1;
  d[L][0] = gx; d[L][1] = gy;
  for (let l = L - 1; l >= 0; l--) {
    const n = sizes[l], m = sizes[l + 1], w = W[l], gw = G.W[l], gb = G.b[l], inp = a[l], dout = d[l + 1], din = d[l], zz = z[l + 1];
    if (l) din.fill(0);
    for (let i = 0; i < m; i++) {
      let dz = dout[i];
      if (l + 1 < L) { const s = sig(zz[i]); dz *= s * (1 + zz[i] * (1 - s)); }
      if (dz === 0) continue;
      gb[i] += dz;
      for (let j = 0, o = i * n; j < n; j++) { gw[o + j] += dz * inp[j]; if (l) din[j] += w[o + j] * dz; }
    }
  }
}

// the loss (1/B) sum_i ||eps_theta(x_t^i, t_i) - eps_i||^2 of a batch, adding
// its gradient to G when G is given
export function batchLoss(net, sc, x0, ts, eps, G) {
  const B = ts.length; let loss = 0;
  for (let i = 0; i < B; i++) {
    const t = ts[i], a = Math.sqrt(sc.abar[t]), s = Math.sqrt(1 - sc.abar[t]);
    const e = forward(net, a * x0[2 * i] + s * eps[2 * i], a * x0[2 * i + 1] + s * eps[2 * i + 1], t, sc.T);
    const rx = e[0] - eps[2 * i], ry = e[1] - eps[2 * i + 1];
    loss += rx * rx + ry * ry;
    if (G) backward(net, 2 * rx / B, 2 * ry / B, G);
  }
  return loss / B;
}

// ------------------------------------------------------------------ training
// avg is a moving average of the weights (decay 0.995 after a warm-up), as in
// Ho et al.: it smooths the noise of Adam, and the page samples with it
export function makeTrainer(net, seed = 1) {
  const zero = () => zeroGrads(net), buf = () => net.sizes.map(n => new Float64Array(n));
  const avg = { sizes: net.sizes, W: net.W.map(w => w.slice()), b: net.b.map(v => v.slice()), z: buf(), a: buf(), d: buf() };
  return { net, avg, G: zero(), m: zero(), v: zero(), k: 0, r: mulberry(seed * 104729 + 1) };
}

// one step of Adam on a fresh batch: B points of the data, t uniform in 1..T,
// eps standard normal
export function trainStep(tr, data, sc, B, lr) {
  const { net, G, m, v, r } = tr, n = data.length / 2;
  const x0 = new Float64Array(2 * B), eps = new Float64Array(2 * B), ts = new Int32Array(B);
  for (let i = 0; i < B; i++) {
    const j = Math.floor(r() * n);
    x0[2 * i] = data[2 * j]; x0[2 * i + 1] = data[2 * j + 1];
    eps[2 * i] = gauss(r); eps[2 * i + 1] = gauss(r);
    ts[i] = 1 + Math.floor(r() * sc.T);
  }
  for (const g of [...G.W, ...G.b]) g.fill(0);
  const loss = batchLoss(net, sc, x0, ts, eps, G);
  tr.k++;
  const c1 = 1 - 0.9 ** tr.k, c2 = 1 - 0.999 ** tr.k;
  const upd = (p, g, mm, vv) => {
    for (let i = 0; i < p.length; i++) {
      mm[i] = 0.9 * mm[i] + 0.1 * g[i]; vv[i] = 0.999 * vv[i] + 0.001 * g[i] * g[i];
      p[i] -= lr * (mm[i] / c1) / (Math.sqrt(vv[i] / c2) + 1e-8);
    }
  };
  net.W.forEach((w, l) => upd(w, G.W[l], m.W[l], v.W[l]));
  net.b.forEach((w, l) => upd(w, G.b[l], m.b[l], v.b[l]));
  const d = Math.min(0.995, (1 + tr.k) / (10 + tr.k)), mix = (A, P) => { for (let i = 0; i < A.length; i++) A[i] = d * A[i] + (1 - d) * P[i]; };
  tr.avg.W.forEach((w, l) => mix(w, net.W[l]));
  tr.avg.b.forEach((w, l) => mix(w, net.b[l]));
  return loss;
}

// ------------------------------------------------------------------ the reverse process
// kind: 'ddpm' (T steps, sigma_t^2 = beta~_t), 'ddim' (T steps, eta = 0) or
// 'ddim20' (DDIM on 20 equally spaced times). The predicted clean point x0^ is
// clipped to [-CLIP, CLIP]^2, as in the code of Ho et al.: with the cosine
// schedule 1/sqrt(alpha_T) is about 30 and the first step would otherwise
// throw the points far away. Unclipped, the DDPM step written with x0^ is the
// update of the page.
const CLIP = 3;
export function makeSampler(sc, kind, n, seed = 1) {
  const r = mulberry(seed * 31337 + 5), K = kind === 'ddim20' ? Math.min(20, sc.T) : sc.T;
  const ts = Array.from({ length: K + 1 }, (_, i) => Math.round(sc.T * (K - i) / K));
  const X = Float64Array.from({ length: 2 * n }, () => gauss(r));
  const z = () => new Float64Array(2 * n);
  return { kind, n, ts, k: 0, r, X, prev: z(), x0: z(), drift: z(), noise: z(), done: false };
}

export function samplerStep(S, net, sc) {
  if (S.done) return;
  const t = S.ts[S.k], s = S.ts[S.k + 1], at = sc.abar[t], as = sc.abar[s], ddpm = S.kind === 'ddpm';
  const sd = Math.sqrt(1 - at), sigma = ddpm && s > 0 ? Math.sqrt(sc.beta[t] * (1 - as) / (1 - at)) : 0;
  const c0 = Math.sqrt(as) * sc.beta[t] / (1 - at), ct = Math.sqrt(sc.alpha[t]) * (1 - as) / (1 - at);
  const { X, prev, x0, drift, noise, r } = S;
  for (let i = 0; i < S.n; i++) {
    const x = X[2 * i], y = X[2 * i + 1], e = forward(net, x, y, t, sc.T), ex = e[0], ey = e[1];
    const hx = Math.max(-CLIP, Math.min(CLIP, (x - sd * ex) / Math.sqrt(at)));
    const hy = Math.max(-CLIP, Math.min(CLIP, (y - sd * ey) / Math.sqrt(at)));
    let mx, my;
    if (ddpm) { mx = c0 * hx + ct * x; my = c0 * hy + ct * y; }
    else {
      // eps recomputed from the clipped x0^, so that the step stays on the line
      const qx = (x - Math.sqrt(at) * hx) / sd, qy = (y - Math.sqrt(at) * hy) / sd;
      mx = Math.sqrt(as) * hx + Math.sqrt(1 - as) * qx; my = Math.sqrt(as) * hy + Math.sqrt(1 - as) * qy;
    }
    const nx = sigma ? sigma * gauss(r) : 0, ny = sigma ? sigma * gauss(r) : 0;
    prev[2 * i] = x; prev[2 * i + 1] = y; x0[2 * i] = hx; x0[2 * i + 1] = hy;
    drift[2 * i] = mx - x; drift[2 * i + 1] = my - y; noise[2 * i] = nx; noise[2 * i + 1] = ny;
    X[2 * i] = mx + nx; X[2 * i + 1] = my + ny;
  }
  S.k++;
  S.done = S.k === S.ts.length - 1;
}

export function sample(net, sc, kind, n, seed) {
  const S = makeSampler(sc, kind, n, seed);
  while (!S.done) samplerStep(S, net, sc);
  return S.X;
}

// ------------------------------------------------------------------ distances between clouds
// the sliced Wasserstein-2 distance over nd equally spaced directions, the
// quantiles of the larger cloud matched to the points of the smaller one
export function slicedW(A, B, nd = 64) {
  const na = A.length / 2, nb = B.length / 2, M = Math.min(na, nb);
  let tot = 0;
  for (let k = 0; k < nd; k++) {
    const c = Math.cos(Math.PI * k / nd), s = Math.sin(Math.PI * k / nd);
    const pa = new Float64Array(na), pb = new Float64Array(nb);
    for (let i = 0; i < na; i++) pa[i] = c * A[2 * i] + s * A[2 * i + 1];
    for (let i = 0; i < nb; i++) pb[i] = c * B[2 * i] + s * B[2 * i + 1];
    pa.sort(); pb.sort();
    let sum = 0;
    for (let q = 0; q < M; q++) { const d = pa[Math.floor((q + 0.5) * na / M)] - pb[Math.floor((q + 0.5) * nb / M)]; sum += d * d; }
    tot += sum / M;
  }
  return Math.sqrt(tot / nd);
}

// the mean distance from a point of A to its nearest point of B
export function meanNN(A, B) {
  const na = A.length / 2, nb = B.length / 2; let tot = 0;
  for (let i = 0; i < na; i++) {
    let best = Infinity;
    for (let j = 0; j < nb; j++) { const dx = A[2 * i] - B[2 * j], dy = A[2 * i + 1] - B[2 * j + 1], d = dx * dx + dy * dy; if (d < best) best = d; }
    tot += Math.sqrt(best);
  }
  return tot / na;
}

// the exact E[sqrt(abar_t) x_0 | x_t] - x_t for the empirical data (a mixture of
// gaussians N(sqrt(abar_t) x_0^i, (1 - abar_t) I)), i.e. sigma_t^2 times the
// score of the noised data; the network estimates it as -sigma_t eps_theta
export function exactDisplacement(data, sc, t, x, y) {
  const a = Math.sqrt(sc.abar[t]), v = 1 - sc.abar[t], n = data.length / 2;
  let mx = -Infinity;
  const lw = new Float64Array(n);
  for (let i = 0; i < n; i++) { const dx = x - a * data[2 * i], dy = y - a * data[2 * i + 1]; lw[i] = -(dx * dx + dy * dy) / (2 * v); if (lw[i] > mx) mx = lw[i]; }
  let sw = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { const w = Math.exp(lw[i] - mx); sw += w; sx += w * a * data[2 * i]; sy += w * a * data[2 * i + 1]; }
  return [sx / sw - x, sy / sw - y];
}

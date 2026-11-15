// The model of the scene on the mixture of experts: K small experts (linear,
// or with one hidden layer of tanh units) and a router (linear, or with one
// hidden layer) whose softmax weighs them, after R. A. Jacobs, M. I. Jordan,
// S. J. Nowlan and G. E. Hinton, "Adaptive Mixtures of Local Experts" (1991).
// The routing is soft (every expert, with the weights of the softmax), top-2
// (N. Shazeer et al., "Outrageously Large Neural Networks", 2017: the softmax
// of the two largest logits) or top-1 (W. Fedus, B. Zoph and N. Shazeer,
// "Switch Transformers", 2021: the chosen expert weighed by its probability,
// so that the router still receives a gradient); the balancing loss is the
// one of the Switch Transformer, alpha K sum_i f_i P_i. All the parameters
// sit in one Float64Array, with the gradients and the moments of Adam beside.

import { rng, dataset } from './nn.js';

export const HE = 4;   // hidden units of an MLP expert
export const HR = 8;   // hidden units of an MLP router

export function createModel({ K = 4, expert = 'linear', router = 'linear', problem = 'classification', seed = 1 } = {}) {
  const H = expert === 'mlp' ? HE : 0, R = router === 'mlp' ? HR : 0;
  const eSize = H ? 4 * H + 1 : 3, rOff = K * eSize, rIn = R || 2;
  const n = rOff + (R ? 3 * R : 0) + K * rIn + K;
  const M = { K, H, R, eSize, rOff, rIn, n, out: problem === 'regression' ? 'linear' : 'tanh',
              p: new Float64Array(n), g: new Float64Array(n), m: new Float64Array(n), v: new Float64Array(n), t: 0 };
  const r = rng(seed * 7919 + 13), gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
  const p = M.p;
  for (let i = 0; i < K; i++) {
    const o = i * eSize;
    if (H) {
      for (let j = 0; j < 2 * H; j++) p[o + j] = 1.5 * gauss();              // W1
      for (let j = 0; j < H; j++) p[o + 2 * H + j] = 0.5 * gauss();          // b1
      for (let j = 0; j < H; j++) p[o + 3 * H + j] = gauss() / Math.sqrt(H); // w2
      p[o + 4 * H] = 0;                                                       // b2
    } else {
      p[o] = gauss(); p[o + 1] = gauss(); p[o + 2] = 0.3 * gauss();
    }
  }
  // a router that starts nearly uniform, as in the Switch Transformer
  let o = rOff;
  if (R) {
    for (let j = 0; j < 2 * R; j++) p[o + j] = 1.5 * gauss();
    for (let j = 0; j < R; j++) p[o + 2 * R + j] = 0.5 * gauss();
    o += 3 * R;
  }
  for (let j = 0; j < K * rIn; j++) p[o + j] = 0.3 * gauss();
  return M;
}

// the offsets of the router: its hidden layer (when there is one) and its last layer
const rLast = M => M.rOff + (M.R ? 3 * M.R : 0);

// a cache for one point
export function cache(M) {
  const { K, H, R } = M;
  return { u1: 0, u2: 0, hE: new Float64Array(K * Math.max(H, 1)), E: new Float64Array(K), hr: new Float64Array(Math.max(R, 1)),
           s: new Float64Array(K), p: new Float64Array(K), g: new Float64Array(K), sel: new Uint8Array(K), y: 0, top: 0 };
}

// k = 0 soft, 1 or 2 top-k; u1, u2 the point scaled to [-1, 1]
export function forward(M, u1, u2, k, C) {
  const { K, H, R, eSize, p } = M;
  C.u1 = u1; C.u2 = u2;
  for (let i = 0; i < K; i++) {
    const o = i * eSize;
    let z;
    if (H) {
      z = p[o + 4 * H];
      for (let j = 0; j < H; j++) {
        const h = Math.tanh(p[o + 2 * j] * u1 + p[o + 2 * j + 1] * u2 + p[o + 2 * H + j]);
        C.hE[i * H + j] = h; z += p[o + 3 * H + j] * h;
      }
    } else z = p[o] * u1 + p[o + 1] * u2 + p[o + 2];
    C.E[i] = M.out === 'tanh' ? Math.tanh(z) : z;
  }
  let o = M.rOff, x = null;
  if (R) {
    for (let j = 0; j < R; j++) C.hr[j] = Math.tanh(p[o + 2 * j] * u1 + p[o + 2 * j + 1] * u2 + p[o + 2 * R + j]);
    o += 3 * R; x = C.hr;
  }
  const rIn = M.rIn, b = o + K * rIn;
  let mx = -Infinity, top = 0;
  for (let i = 0; i < K; i++) {
    let s = p[b + i];
    if (x) for (let j = 0; j < R; j++) s += p[o + i * R + j] * x[j];
    else s += p[o + 2 * i] * u1 + p[o + 2 * i + 1] * u2;
    C.s[i] = s;
    if (s > mx) { mx = s; top = i; }
  }
  let Z = 0;
  for (let i = 0; i < K; i++) { C.p[i] = Math.exp(C.s[i] - mx); Z += C.p[i]; }
  for (let i = 0; i < K; i++) C.p[i] /= Z;
  C.top = top;
  C.sel.fill(0); C.g.fill(0);
  if (k === 0 || k >= K) { for (let i = 0; i < K; i++) { C.sel[i] = 1; C.g[i] = C.p[i]; } }
  else if (k === 1) { C.sel[top] = 1; C.g[top] = C.p[top]; }
  else {
    // the k largest logits, and the softmax among them
    const idx = Array.from({ length: K }, (_, i) => i).sort((a, c) => C.s[c] - C.s[a]).slice(0, k);
    let S = 0;
    for (const i of idx) { C.sel[i] = 1; S += C.p[i]; }
    for (const i of idx) C.g[i] = C.p[i] / S;
  }
  let y = 0;
  for (let i = 0; i < K; i++) y += C.g[i] * C.E[i];
  C.y = y;
  return y;
}

// accumulates into M.g the gradient of a loss whose derivative with respect
// to y is dy, plus dsx[i] directly on the logits (from the balancing loss)
const dgTmp = new Float64Array(16), dsTmp = new Float64Array(16), dhTmp = new Float64Array(16);
export function backward(M, C, k, dy, dsx) {
  const { K, H, R, eSize, p, g } = M, u1 = C.u1, u2 = C.u2;
  // the experts
  for (let i = 0; i < K; i++) {
    const gi = C.g[i];
    dgTmp[i] = dy * C.E[i];
    if (!gi) continue;
    const E = C.E[i], dz = dy * gi * (M.out === 'tanh' ? 1 - E * E : 1), o = i * eSize;
    if (H) {
      g[o + 4 * H] += dz;
      for (let j = 0; j < H; j++) {
        const h = C.hE[i * H + j], dh = dz * p[o + 3 * H + j] * (1 - h * h);
        g[o + 3 * H + j] += dz * h;
        g[o + 2 * H + j] += dh; g[o + 2 * j] += dh * u1; g[o + 2 * j + 1] += dh * u2;
      }
    } else { g[o] += dz * u1; g[o + 1] += dz * u2; g[o + 2] += dz; }
  }
  // from the gates to the logits
  dsTmp.fill(0, 0, K);
  if (k === 0 || k >= K) {
    let a = 0; for (let i = 0; i < K; i++) a += C.p[i] * dgTmp[i];
    for (let i = 0; i < K; i++) dsTmp[i] = C.p[i] * (dgTmp[i] - a);
  } else if (k === 1) {
    const t = C.top, d = dgTmp[t] * C.p[t];
    for (let i = 0; i < K; i++) dsTmp[i] = d * ((i === t ? 1 : 0) - C.p[i]);
  } else {
    let a = 0; for (let i = 0; i < K; i++) if (C.sel[i]) a += C.g[i] * dgTmp[i];
    for (let i = 0; i < K; i++) if (C.sel[i]) dsTmp[i] = C.g[i] * (dgTmp[i] - a);
  }
  if (dsx) for (let i = 0; i < K; i++) dsTmp[i] += dsx[i];
  // the router
  const o = rLast(M), b = o + K * M.rIn;
  if (R) {
    dhTmp.fill(0, 0, R);
    for (let i = 0; i < K; i++) {
      const d = dsTmp[i]; g[b + i] += d;
      for (let j = 0; j < R; j++) { g[o + i * R + j] += d * C.hr[j]; dhTmp[j] += d * p[o + i * R + j]; }
    }
    const o0 = M.rOff;
    for (let j = 0; j < R; j++) {
      const h = C.hr[j], d = dhTmp[j] * (1 - h * h);
      g[o0 + 2 * R + j] += d; g[o0 + 2 * j] += d * u1; g[o0 + 2 * j + 1] += d * u2;
    }
  } else {
    for (let i = 0; i < K; i++) { const d = dsTmp[i]; g[b + i] += d; g[o + 2 * i] += d * u1; g[o + 2 * i + 1] += d * u2; }
  }
}

// the loss of a batch, 1/(2N) sum (y - t)^2 + alpha K sum_i f_i P_i, with f_i
// the fraction of the points whose largest gate is i and P_i the mean
// probability of i; with grad, its gradient is added to M.g (f_i is piecewise
// constant, so its derivative is zero wherever it is defined)
export function batch(M, pts, k, alpha, grad = true) {
  const N = pts.length, K = M.K;
  if (!M.caches || M.caches.length < N) M.caches = Array.from({ length: N }, () => cache(M));
  const caches = M.caches;
  const f = new Float64Array(K), P = new Float64Array(K);
  let mse = 0;
  for (let n = 0; n < N; n++) {
    const C = caches[n], q = pts[n];
    forward(M, q.u1, q.u2, k, C);
    f[C.top] += 1 / N;
    for (let i = 0; i < K; i++) P[i] += C.p[i] / N;
    mse += 0.5 * (C.y - q.label) ** 2 / N;
  }
  let aux = 0;
  for (let i = 0; i < K; i++) aux += f[i] * P[i];
  aux *= alpha * K;
  if (grad) {
    const dsx = new Float64Array(K);
    for (let n = 0; n < N; n++) {
      const C = caches[n];
      let fp = 0; for (let i = 0; i < K; i++) fp += f[i] * C.p[i];
      for (let i = 0; i < K; i++) dsx[i] = alpha * K / N * C.p[i] * (f[i] - fp);
      backward(M, C, k, (C.y - pts[n].label) / N, alpha ? dsx : null);
    }
  }
  return { loss: mse + aux, mse, aux, f, P };
}

export function adam(M, lr) {
  const { p, g, m, v } = M;
  M.t++;
  const c1 = 1 - 0.9 ** M.t, c2 = 1 - 0.999 ** M.t;
  for (let j = 0; j < M.n; j++) {
    m[j] = 0.9 * m[j] + 0.1 * g[j];
    v[j] = 0.999 * v[j] + 0.001 * g[j] * g[j];
    p[j] -= lr * (m[j] / c1) / (Math.sqrt(v[j] / c2) + 1e-8);
    g[j] = 0;
  }
}

// one pass over the training points in shuffled minibatches
export function epoch(M, train, k, alpha, lr, bs, r) {
  const idx = train.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (let i = 0; i < idx.length; i += bs) {
    batch(M, idx.slice(i, i + bs).map(j => train[j]), k, alpha, true);
    adam(M, lr);
  }
}

// the load of every expert: the fraction of the points whose largest gate is it
export function load(M, pts, k) {
  const C = cache(M), f = new Float64Array(M.K);
  for (const q of pts) { forward(M, q.u1, q.u2, k, C); f[C.top] += 1 / pts.length; }
  return f;
}
// the effective number of experts, exp of the entropy of the load
export function effective(f) { let h = 0; for (const x of f) if (x > 0) h -= x * Math.log(x); return Math.exp(h); }

// everything the drawings need on an n x n grid over [-6, 6]^2, rows from the top
export function grid(M, k, n) {
  const K = M.K, C = cache(M), y = new Float64Array(n * n), top = new Uint8Array(n * n), pmax = new Float64Array(n * n);
  const E = new Float64Array(K * n * n), G = new Float64Array(K * n * n), D = new Float64Array(K * n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const q = j * n + i;
    forward(M, -1 + 2 * (i + 0.5) / n, 1 - 2 * (j + 0.5) / n, k, C);
    y[q] = C.y; top[q] = C.top; pmax[q] = C.p[C.top];
    // D: how far the logit of e is above the largest of the others, zero on the border of its region
    let s1 = -Infinity, s2 = -Infinity;
    for (let e = 0; e < K; e++) { const v = C.s[e]; if (v > s1) { s2 = s1; s1 = v; } else if (v > s2) s2 = v; }
    for (let e = 0; e < K; e++) { E[e * n * n + q] = C.E[e]; G[e * n * n + q] = C.g[e]; D[e * n * n + q] = C.s[e] - (C.s[e] === s1 ? s2 : s1); }
  }
  return { n, K, y, top, pmax, E, G, D };
}

// ------------------------------------------------------------------ data
// points in [-6, 6]^2 with labels in [-1, 1]; u1, u2 the point scaled to [-1, 1]
export const DATA = {
  xor: { problem: 'classification' }, checker: { problem: 'classification' },
  spiral: { problem: 'classification' }, circle: { problem: 'classification' },
  planes: { problem: 'regression' }, regimes: { problem: 'regression' },
};
export function target(kind, x, y) {
  if (kind === 'checker') return (Math.floor((x + 6) / 4) + Math.floor((y + 6) / 4)) % 2 ? -1 : 1;
  if (kind === 'planes') {
    // four planes, one in each quadrant, with jumps along the axes
    if (x >= 0 && y >= 0) return 0.8 - (x + y) / 10;
    if (x < 0 && y >= 0) return -0.6 + y / 10;
    if (x < 0) return 0.2 - x / 8;
    return -0.8 + x / 10 - y / 15;
  }
  if (kind === 'regimes') return x < 0 ? (x + y) / 14 : 0.8 * Math.sin(1.2 * y);
  return 0;
}
export function makeData(kind, n, noise, seed) {
  const r = rng(seed * 31 + 1);
  let pts;
  if (kind === 'xor' || kind === 'spiral' || kind === 'circle') pts = dataset(kind, n, noise, r);
  else {
    pts = [];
    for (let i = 0; i < n; i++) {
      const x = 12 * r() - 6, y = 12 * r() - 6;
      if (DATA[kind].problem === 'classification') {
        const xn = x + noise * 3 * (r() - 0.5), yn = y + noise * 3 * (r() - 0.5);
        pts.push({ x: xn, y: yn, label: target(kind, x, y) });
      } else pts.push({ x, y, label: target(kind, x, y) + noise * (r() - 0.5) });
    }
  }
  for (const q of pts) { q.u1 = q.x / 6; q.u2 = q.y / 6; }
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  return pts;
}

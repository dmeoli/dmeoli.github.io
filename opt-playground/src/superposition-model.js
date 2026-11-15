// The toy model of scene H, without the page: n features squeezed into m
// hidden dimensions, h = W x, read back as x' = ReLU(W'W x + b) (or linearly),
// with the loss (1/B) sum over the batch of sum_i I_i (x_i - x'_i)^2, its
// gradient, and Adam on W (m x n) and b.

import { rng } from './nn.js';

export function init(n, m, seed) {
  const r = rng(seed * 101 + 3);
  const W = Array.from({ length: m }, () => Array.from({ length: n }, () => (r() - 0.5) * 0.4));
  const b = Array(n).fill(0);
  return { n, m, W, b, r, steps: 0, st: { mW: W.map(row => row.map(() => 0)), vW: W.map(row => row.map(() => 0)), mb: b.map(() => 0), vb: b.map(() => 0), t: 0 } };
}

// the loss and its gradient on a batch xs of feature vectors
export function lossGrad(W, b, xs, I, relu) {
  const m = W.length, n = b.length, B = xs.length, gW = W.map(row => row.map(() => 0)), gb = Array(n).fill(0);
  let loss = 0;
  for (const x of xs) {
    const h = W.map(row => row.reduce((t, w, j) => t + w * x[j], 0));
    for (let i = 0; i < n; i++) {
      let y = b[i]; for (let c = 0; c < m; c++) y += W[c][i] * h[c];
      const o = relu ? Math.max(0, y) : y;
      loss += I[i] * (o - x[i]) ** 2 / B;
      const dy = 2 * I[i] * (o - x[i]) * (relu && y <= 0 ? 0 : 1) / B;
      if (!dy) continue;
      gb[i] += dy;
      for (let c = 0; c < m; c++) {
        gW[c][i] += h[c] * dy;                                          // through W' in the read-out
        for (let j = 0; j < n; j++) gW[c][j] += W[c][i] * dy * x[j];    // through W in h
      }
    }
  }
  return { loss, gW, gb };
}

// k steps of Adam on batches of 128, features active with probability p
export function trainSteps(M, k, { p, decay, relu, lr = 0.01, B = 128 }) {
  const { n, m, W, b, r, st } = M, I = Array.from({ length: n }, (_, i) => decay ** i);
  for (let it = 0; it < k; it++) {
    const xs = Array.from({ length: B }, () => Array.from({ length: n }, () => (r() < p ? r() : 0)));
    const { gW, gb } = lossGrad(W, b, xs, I, relu);
    st.t++;
    const c1 = 1 - 0.9 ** st.t, c2 = 1 - 0.999 ** st.t, upd = (g, mm, vv, i, j) => {
      mm[i][j] = 0.9 * mm[i][j] + 0.1 * g; vv[i][j] = 0.999 * vv[i][j] + 0.001 * g * g;
      return lr * (mm[i][j] / c1) / (Math.sqrt(vv[i][j] / c2) + 1e-8);
    };
    for (let c = 0; c < m; c++) for (let j = 0; j < n; j++) W[c][j] -= upd(gW[c][j], st.mW, st.vW, c, j);
    for (let i = 0; i < n; i++) b[i] -= upd(gb[i], [st.mb], [st.vb], 0, i);
    M.steps++;
  }
}

export const norms = W => W[0].map((_, i) => Math.hypot(...W.map(row => row[i])));
export const gram = (W, i, j) => W.reduce((s, row) => s + row[i] * row[j], 0);

// A small convolutional network in plain JavaScript, for scene I (conv.html):
// input 20x20 -> conv 3x3 (c1 filters, zero padding) -> ReLU -> max-pool 2x2
// -> conv 3x3 (c2 filters on the c1 maps) -> ReLU -> max-pool 2x2 -> dense
// softmax over 10 classes, with its own backward pass and Adam. The input
// gradient of a layer-2 channel is also given, for feature visualization.

import { rng } from './nn.js';

export const N = 20, P1 = N / 2, P2 = N / 4, NC = 10;
export const PARAMS = ['w1', 'b1', 'w2', 'b2', 'wd', 'bd'];

export function makeNet(c1, c2, seed = 1) {
  const r = rng(seed * 7919 + 13), gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
  const fill = (n, s) => Float64Array.from({ length: n }, () => s * gauss());
  const D = c2 * P2 * P2;
  const net = {
    c1, c2, D,
    w1: fill(c1 * 9, Math.sqrt(2 / 9)), b1: new Float64Array(c1),
    w2: fill(c2 * c1 * 9, Math.sqrt(2 / (9 * c1))), b2: new Float64Array(c2),
    wd: fill(NC * D, Math.sqrt(1 / D)), bd: new Float64Array(NC),
  };
  net.adam = { t: 0, m: {}, v: {} };
  for (const p of PARAMS) { net.adam.m[p] = new Float64Array(net[p].length); net.adam.v[p] = new Float64Array(net[p].length); }
  return net;
}

export function zeroGrads(net) {
  const g = {};
  for (const p of PARAMS) g[p] = new Float64Array(net[p].length);
  return g;
}

// out[f][i][j] = b[f] + sum_{c,u,v} w[f][c][u][v] in[c][i+u-1][j+v-1]
function conv(inp, C, H, w, b, F) {
  const out = new Float64Array(F * H * H);
  for (let f = 0; f < F; f++) {
    const of = f * H * H;
    for (let k = 0; k < H * H; k++) out[of + k] = b[f];
    for (let c = 0; c < C; c++) for (let u = 0; u < 3; u++) for (let v = 0; v < 3; v++) {
      const wv = w[((f * C + c) * 3 + u) * 3 + v], i0 = Math.max(0, 1 - u), i1 = Math.min(H, H + 1 - u), j0 = Math.max(0, 1 - v), j1 = Math.min(H, H + 1 - v);
      for (let i = i0; i < i1; i++) {
        const ro = of + i * H, ri = c * H * H + (i + u - 1) * H + v - 1;
        for (let j = j0; j < j1; j++) out[ro + j] += wv * inp[ri + j];
      }
    }
  }
  return out;
}

// the backward of conv: gw, gb and din are accumulated when given
function convBack(inp, C, H, w, F, dout, gw, gb, din) {
  for (let f = 0; f < F; f++) {
    const of = f * H * H;
    if (gb) { let s = 0; for (let k = 0; k < H * H; k++) s += dout[of + k]; gb[f] += s; }
    for (let c = 0; c < C; c++) for (let u = 0; u < 3; u++) for (let v = 0; v < 3; v++) {
      const wi = ((f * C + c) * 3 + u) * 3 + v, wv = w[wi], i0 = Math.max(0, 1 - u), i1 = Math.min(H, H + 1 - u), j0 = Math.max(0, 1 - v), j1 = Math.min(H, H + 1 - v);
      let s = 0;
      for (let i = i0; i < i1; i++) {
        const ro = of + i * H, ri = c * H * H + (i + u - 1) * H + v - 1;
        for (let j = j0; j < j1; j++) {
          const d = dout[ro + j];
          s += d * inp[ri + j];
          if (din) din[ri + j] += wv * d;
        }
      }
      if (gw) gw[wi] += s;
    }
  }
}

function relu(z) { const a = new Float64Array(z.length); for (let k = 0; k < z.length; k++) a[k] = z[k] > 0 ? z[k] : 0; return a; }

// max-pool 2x2: the maximum and the index where it was taken
function pool(a, C, H) {
  const h = H / 2, out = new Float64Array(C * h * h), idx = new Int32Array(C * h * h);
  for (let c = 0; c < C; c++) for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) {
    let best = -Infinity, bi = 0;
    for (let u = 0; u < 2; u++) for (let v = 0; v < 2; v++) {
      const k = c * H * H + (2 * i + u) * H + 2 * j + v;
      if (a[k] > best) { best = a[k]; bi = k; }
    }
    const o = c * h * h + i * h + j;
    out[o] = best; idx[o] = bi;
  }
  return { out, idx };
}

export function forward(net, x) {
  const { c1, c2, D } = net;
  const z1 = conv(x, 1, N, net.w1, net.b1, c1), a1 = relu(z1), q1 = pool(a1, c1, N);
  const z2 = conv(q1.out, c1, P1, net.w2, net.b2, c2), a2 = relu(z2), q2 = pool(a2, c2, P1);
  const logits = new Float64Array(NC), p2 = q2.out;
  for (let k = 0; k < NC; k++) { let s = net.bd[k]; const o = k * D; for (let d = 0; d < D; d++) s += net.wd[o + d] * p2[d]; logits[k] = s; }
  const mx = Math.max(...logits), prob = new Float64Array(NC);
  let Z = 0;
  for (let k = 0; k < NC; k++) Z += (prob[k] = Math.exp(logits[k] - mx));
  for (let k = 0; k < NC; k++) prob[k] /= Z;
  return { x, z1, a1, p1: q1.out, i1: q1.idx, z2, a2, p2, i2: q2.idx, logits, prob };
}

export const loss = (cache, y) => -Math.log(Math.max(cache.prob[y], 1e-300));

// from the gradient on z2 down to the parameters of layer 1 (and to the input)
function backFromZ2(net, f, dz2, g, dx) {
  const { c1, c2 } = net, dp1 = new Float64Array(c1 * P1 * P1);
  convBack(f.p1, c1, P1, net.w2, c2, dz2, g && g.w2, g && g.b2, dp1);
  const dz1 = new Float64Array(c1 * N * N);
  for (let o = 0; o < dp1.length; o++) { const k = f.i1[o]; if (f.z1[k] > 0) dz1[k] += dp1[o]; }
  convBack(f.x, 1, N, net.w1, c1, dz1, g && g.w1, g && g.b1, dx);
}

// cross-entropy of the label y: the gradients are added to g
export function backward(net, f, y, g) {
  const { c2, D } = net, dl = Float64Array.from(f.prob);
  dl[y] -= 1;
  const dp2 = new Float64Array(D);
  for (let k = 0; k < NC; k++) {
    const o = k * D, d = dl[k];
    g.bd[k] += d;
    for (let e = 0; e < D; e++) { g.wd[o + e] += d * f.p2[e]; dp2[e] += net.wd[o + e] * d; }
  }
  const dz2 = new Float64Array(c2 * P1 * P1);
  for (let o = 0; o < D; o++) { const k = f.i2[o]; if (f.z2[k] > 0) dz2[k] += dp2[o]; }
  backFromZ2(net, f, dz2, g, null);
}

// the mean of the pre-activation of channel k of layer 2, and its gradient in x
export function channelObjective(net, x, k) {
  const f = forward(net, x), M = P1 * P1, dz2 = new Float64Array(net.c2 * M);
  let s = 0;
  for (let t = 0; t < M; t++) { s += f.z2[k * M + t]; dz2[k * M + t] = 1 / M; }
  const dx = new Float64Array(N * N);
  backFromZ2(net, f, dz2, null, dx);
  return { value: s / M, dx };
}

export function adam(net, g, scale, lr, b1 = 0.9, b2 = 0.999) {
  const A = net.adam;
  A.t++;
  const c1 = 1 - b1 ** A.t, c2 = 1 - b2 ** A.t;
  for (const p of PARAMS) {
    const w = net[p], gp = g[p], m = A.m[p], v = A.v[p];
    for (let i = 0; i < w.length; i++) {
      const gi = gp[i] * scale;
      m[i] = b1 * m[i] + (1 - b1) * gi; v[i] = b2 * v[i] + (1 - b2) * gi * gi;
      w[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8);
    }
  }
}

// one step of Adam on a mini-batch: the mean loss of the batch is returned
export function trainBatch(net, X, Y, ids, lr) {
  const g = zeroGrads(net);
  let L = 0;
  for (const i of ids) { const f = forward(net, X[i]); L += loss(f, Y[i]); backward(net, f, Y[i], g); }
  adam(net, g, 1 / ids.length, lr);
  return L / ids.length;
}

export function accuracy(net, X, Y, from = 0, to = X.length) {
  let ok = 0;
  for (let i = from; i < to; i++) { const p = forward(net, X[i]).prob; let b = 0; for (let k = 1; k < NC; k++) if (p[k] > p[b]) b = k; if (b === Y[i]) ok++; }
  return ok;
}

// the input that maximizes channel k of layer 2: gradient ascent from noise,
// with normalized steps, x kept in [0, 1], a small decay and a blur every
// few steps so that the image does not fill with high frequencies
export function visualize(net, k, seed = 1, iters = 120) {
  const r = rng(seed * 31 + k * 101 + 5);
  let x = Float64Array.from({ length: N * N }, () => 0.5 + 0.2 * (r() - 0.5));
  for (let it = 0; it < iters; it++) {
    const { dx } = channelObjective(net, x, k);
    let s = 0; for (let t = 0; t < dx.length; t++) s += dx[t] * dx[t];
    const step = 0.08 / (Math.sqrt(s / dx.length) + 1e-12);
    for (let t = 0; t < x.length; t++) x[t] = Math.min(1, Math.max(0, x[t] * 0.995 + step * dx[t]));
    if (it % 4 === 3) x = blur(x);
  }
  return x;
}

function blur(x) {
  const y = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    let s = 0, w = 0;
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
      const a = i + u, b = j + v;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const c = u || v ? (u && v ? 0.05 : 0.1) : 0.4;
      s += c * x[a * N + b]; w += c;
    }
    y[i * N + j] = s / w;
  }
  return y;
}

// the receptive field in the input of a cell of a map (m1, m2 the maps of
// layers 1 and 2, q1, q2 the pooled ones), as rows r0..r1 and
// columns c0..c1 (inclusive), clipped to the grid
export function receptiveField(stage, i, j) {
  const span = { m1: [1, -1, 1], q1: [2, -1, 2], m2: [2, -3, 4], q2: [4, -3, 6] }[stage];
  const [s, lo, hi] = span, cl = t => Math.max(0, Math.min(N - 1, t));
  return [cl(s * i + lo), cl(s * i + hi), cl(s * j + lo), cl(s * j + hi)];
}

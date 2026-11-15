// A small message-passing network for scene L, with its own forward and
// backward pass. A graph is { N, F, X (N x F features), edges [[u, v], ...] };
// the input layer embeds the features, h^(0) = X W_in + b_in, then every round
// k computes
//   z_v = sum_{u in N(v) u {v}} c_uv h_u^(k),   h_v^(k+1) = tanh(W^(k) z_v + b^(k)),
// where c_uv = 1 / sqrt(d_u d_v) with the degrees counted with the self-loop
// (GCN, Kipf and Welling) or c_uv = 1 (sum, in the style of GIN with eps = 0
// and a one-layer perceptron, Xu et al.). The read-out is linear, on every
// node (node tasks) or on the mean of the last states (graph tasks), into a
// softmax. All arrays are flat Float64Arrays in row-major order; a matrix of
// a layer in -> out is W[i * out + j], so that a row vector h maps to h W.

import { rng } from './nn.js';

function tensor(name, n, scale, r) {
  const data = new Float64Array(n);
  if (scale) for (let i = 0; i < n; i++) data[i] = scale * gauss(r);
  return { name, data, grad: new Float64Array(n), m: new Float64Array(n), v: new Float64Array(n) };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

// cfg: { F (features), H (hidden), K (rounds), C (classes), agg: 'gcn' | 'gin', level: 'node' | 'graph', seed }
export function createModel(cfg) {
  const r = rng(cfg.seed * 7919 + 17), { F, H, K, C } = cfg;
  const M = { cfg, params: [], t: 0 };
  const add = t => { M.params.push(t); return t; };
  M.Win = add(tensor('Win', F * H, F > 8 ? 0.1 : 1 / Math.sqrt(F), r));
  M.bin = add(tensor('bin', H));
  M.W = []; M.b = [];
  for (let k = 0; k < K; k++) {
    M.W.push(add(tensor(`W${k}`, H * H, (cfg.agg === 'gin' ? 0.6 : 1.2) / Math.sqrt(H), r)));
    M.b.push(add(tensor(`b${k}`, H)));
  }
  M.Wout = add(tensor('Wout', H * C, 1 / Math.sqrt(H), r));
  M.bout = add(tensor('bout', C));
  return M;
}

// the incoming lists of every node, with the coefficients of the aggregation,
// kept on the graph: g.inc[agg][v] = [[u, c], ...], v itself included
export function incoming(g, agg) {
  g.inc ??= {};
  if (g.inc[agg]) return g.inc[agg];
  const nb = Array.from({ length: g.N }, () => []);
  for (const [u, v] of g.edges) { nb[u].push(v); nb[v].push(u); }
  const d = nb.map(a => a.length + 1);
  g.inc[agg] = nb.map((a, v) => [[v, agg === 'gcn' ? 1 / d[v] : 1], ...a.map(u => [u, agg === 'gcn' ? 1 / Math.sqrt(d[u] * d[v]) : 1])]);
  return g.inc[agg];
}

// the states of every round, h[0..K] (N x H each), the aggregates z[0..K-1],
// the logits (N x C, or 1 x C for a graph) and their softmax
export function forward(M, g) {
  const { H, K, C, agg, level } = M.cfg, { N, F, X } = g, inc = incoming(g, agg);
  const h0 = new Float64Array(N * H), Win = M.Win.data;
  for (let v = 0; v < N; v++) {
    for (let j = 0; j < H; j++) h0[v * H + j] = M.bin.data[j];
    for (let f = 0; f < F; f++) {
      const x = X[v * F + f]; if (!x) continue;
      for (let j = 0; j < H; j++) h0[v * H + j] += x * Win[f * H + j];
    }
  }
  const h = [h0], z = [];
  for (let k = 0; k < K; k++) {
    const hk = h[k], zk = new Float64Array(N * H), hn = new Float64Array(N * H), W = M.W[k].data, b = M.b[k].data;
    for (let v = 0; v < N; v++) {
      for (const [u, c] of inc[v]) for (let j = 0; j < H; j++) zk[v * H + j] += c * hk[u * H + j];
      for (let j = 0; j < H; j++) {
        let a = b[j];
        for (let i = 0; i < H; i++) a += zk[v * H + i] * W[i * H + j];
        hn[v * H + j] = Math.tanh(a);
      }
    }
    z.push(zk); h.push(hn);
  }
  const hK = h[K], rows = level === 'graph' ? 1 : N, out = new Float64Array(rows * H);
  if (level === 'graph') { for (let v = 0; v < N; v++) for (let j = 0; j < H; j++) out[j] += hK[v * H + j] / N; }
  else out.set(hK);
  const logits = new Float64Array(rows * C), P = new Float64Array(rows * C);
  for (let v = 0; v < rows; v++) {
    let mx = -Infinity;
    for (let c = 0; c < C; c++) {
      let a = M.bout.data[c];
      for (let j = 0; j < H; j++) a += out[v * H + j] * M.Wout.data[j * C + c];
      logits[v * C + c] = a; mx = Math.max(mx, a);
    }
    let s = 0;
    for (let c = 0; c < C; c++) s += (P[v * C + c] = Math.exp(logits[v * C + c] - mx));
    for (let c = 0; c < C; c++) P[v * C + c] /= s;
  }
  return { g, h, z, out, logits, P, rows };
}

// the weighted cross-entropy of the targets [{ v, y, w }] (v = 0 for a graph),
// divided by `norm`; its gradient is added to the grads, and the loss returned
export function backward(M, R, targets, norm) {
  const { H, K, C, agg, level } = M.cfg, { g, h, z, out, P } = R, N = g.N, inc = incoming(g, agg);
  const dout = new Float64Array(out.length);
  let loss = 0;
  for (const { v, y, w } of targets) {
    loss -= w * Math.log(P[v * C + y] + 1e-300) / norm;
    for (let c = 0; c < C; c++) {
      const dl = w * (P[v * C + c] - (c === y ? 1 : 0)) / norm;
      M.bout.grad[c] += dl;
      for (let j = 0; j < H; j++) { M.Wout.grad[j * C + c] += out[v * H + j] * dl; dout[v * H + j] += M.Wout.data[j * C + c] * dl; }
    }
  }
  let dh = new Float64Array(N * H);
  if (level === 'graph') { for (let v = 0; v < N; v++) for (let j = 0; j < H; j++) dh[v * H + j] = dout[j] / N; }
  else dh.set(dout);
  for (let k = K - 1; k >= 0; k--) {
    const hn = h[k + 1], zk = z[k], W = M.W[k], b = M.b[k], dprev = new Float64Array(N * H), da = new Float64Array(H), dz = new Float64Array(H);
    for (let v = 0; v < N; v++) {
      for (let j = 0; j < H; j++) { const t = hn[v * H + j]; da[j] = dh[v * H + j] * (1 - t * t); b.grad[j] += da[j]; }
      for (let i = 0; i < H; i++) {
        let s = 0; const zi = zk[v * H + i];
        for (let j = 0; j < H; j++) { W.grad[i * H + j] += zi * da[j]; s += W.data[i * H + j] * da[j]; }
        dz[i] = s;
      }
      for (const [u, c] of inc[v]) for (let i = 0; i < H; i++) dprev[u * H + i] += c * dz[i];
    }
    dh = dprev;
  }
  const { F, X } = g;
  for (let v = 0; v < N; v++) for (let j = 0; j < H; j++) {
    const d = dh[v * H + j]; if (!d) continue;
    M.bin.grad[j] += d;
    for (let f = 0; f < F; f++) { const x = X[v * F + f]; if (x) M.Win.grad[f * H + j] += x * d; }
  }
  return loss;
}

export function zeroGrad(M) { for (const p of M.params) p.grad.fill(0); }

// Adam on the accumulated gradients, after clipping their norm to 5, with an
// optional decay wd of the weights (added to the gradient, as an L2 term)
export function adam(M, lr, wd = 0, b1 = 0.9, b2 = 0.999) {
  let nn = 0;
  for (const p of M.params) for (let i = 0; i < p.grad.length; i++) nn += p.grad[i] ** 2;
  const clip = Math.min(1, 5 / (Math.sqrt(nn) + 1e-12));
  M.t++;
  const c1 = 1 - b1 ** M.t, c2 = 1 - b2 ** M.t;
  for (const p of M.params) {
    const { data, grad, m, v } = p;
    for (let i = 0; i < data.length; i++) {
      const gr = grad[i] * clip + wd * data[i];
      m[i] = b1 * m[i] + (1 - b1) * gr; v[i] = b2 * v[i] + (1 - b2) * gr * gr;
      data[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8);
    }
  }
}

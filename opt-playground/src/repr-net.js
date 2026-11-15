// The network of scene M: a perceptron 400 -> h1 -> h2 -> 10 with ReLU on the
// hidden layers and a softmax on the logits, trained with Adam on the
// cross-entropy. The weights are flat Float64Arrays, W[l] of size out x in.

import { rng } from './nn.js';

export function makeNet(sizes, seed = 1) {
  const r = rng(seed * 7919 + 3), gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const W = [], b = [];
  for (let l = 1; l < sizes.length; l++) {
    const n = sizes[l], m = sizes[l - 1], s = Math.sqrt(2 / m);       // He, for the ReLU
    W.push(Float64Array.from({ length: n * m }, () => s * gauss()));
    b.push(new Float64Array(n));
  }
  return { sizes, W, b, t: 0, m: null, v: null };
}

// the activations of every layer: acts[0] the input, acts[1..L-1] after the
// ReLU, acts[L] the logits; prob the softmax of the logits
export function forward(net, x) {
  const { sizes, W, b } = net, L = sizes.length - 1, acts = [x];
  for (let l = 0; l < L; l++) {
    const n = sizes[l + 1], m = sizes[l], a = acts[l], w = W[l], y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = b[l][i];
      for (let j = 0, o = i * m; j < m; j++) s += w[o + j] * a[j];
      y[i] = l < L - 1 && s < 0 ? 0 : s;
    }
    acts.push(y);
  }
  const z = acts[L], prob = new Float64Array(z.length);
  let mx = -Infinity, S = 0;
  for (const v of z) mx = Math.max(mx, v);
  for (let k = 0; k < z.length; k++) S += (prob[k] = Math.exp(z[k] - mx));
  for (let k = 0; k < z.length; k++) prob[k] /= S;
  return { acts, prob };
}

export const loss = (f, y) => -Math.log(Math.max(f.prob[y], 1e-300));

export function zeroGrads(net) {
  return { W: net.W.map(w => new Float64Array(w.length)), b: net.b.map(v => new Float64Array(v.length)) };
}

// adds to g the gradient of the cross-entropy at one example
export function backward(net, f, y, g) {
  const { sizes, W } = net, L = sizes.length - 1;
  let d = Float64Array.from(f.prob); d[y] -= 1;               // d loss / d logits
  for (let l = L - 1; l >= 0; l--) {
    const n = sizes[l + 1], m = sizes[l], a = f.acts[l], w = W[l], gw = g.W[l], gb = g.b[l];
    const dp = l ? new Float64Array(m) : null;
    for (let i = 0; i < n; i++) {
      const di = d[i]; if (di === 0) continue;
      gb[i] += di;
      for (let j = 0, o = i * m; j < m; j++) { gw[o + j] += di * a[j]; if (dp) dp[j] += di * w[o + j]; }
    }
    if (dp) for (let j = 0; j < m; j++) if (a[j] <= 0) dp[j] = 0;   // through the ReLU of layer l
    d = dp;
  }
}

export function adam(net, g, scale, lr, b1 = 0.9, b2 = 0.999) {
  if (!net.m) { net.m = zeroGrads(net); net.v = zeroGrads(net); }
  net.t++;
  const c1 = 1 - b1 ** net.t, c2 = 1 - b2 ** net.t;
  for (const key of ['W', 'b']) for (let l = 0; l < net[key].length; l++) {
    const p = net[key][l], gg = g[key][l], m = net.m[key][l], v = net.v[key][l];
    for (let i = 0; i < p.length; i++) {
      const gi = gg[i] * scale;
      m[i] = b1 * m[i] + (1 - b1) * gi; v[i] = b2 * v[i] + (1 - b2) * gi * gi;
      p[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8);
    }
  }
}

// one step of Adam on the examples ids; returns their mean loss
export function trainBatch(net, X, Y, ids, lr) {
  const g = zeroGrads(net);
  let s = 0;
  for (const i of ids) { const f = forward(net, X[i]); s += loss(f, Y[i]); backward(net, f, Y[i], g); }
  adam(net, g, 1 / ids.length, lr);
  return s / ids.length;
}

// the activations of a set of examples, one flat n x d array per layer
export function layerActivations(net, X) {
  const n = X.length, out = net.sizes.map(d => new Float64Array(n * d)), pred = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const f = forward(net, X[i]);
    f.acts.forEach((a, l) => out[l].set(a, i * a.length));
    let best = 0; for (let k = 1; k < f.prob.length; k++) if (f.prob[k] > f.prob[best]) best = k;
    pred[i] = best;
  }
  return { acts: out, pred };
}

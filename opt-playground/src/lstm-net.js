// A tiny recurrent network in plain JavaScript, with LSTM cells, GRU cells or
// plain tanh cells, forward pass, backpropagation through time and Adam.
// The inputs are symbols (one-hot vectors of size D, given by their index), the
// outputs a softmax over K classes read at chosen steps. With z_t = [h_{t-1}, x_t]:
//   LSTM  f = s(W_f z + b_f), i = s(W_i z + b_i), g = tanh(W_c z + b_c),
//         o = s(W_o z + b_o), c_t = f c_{t-1} + i g, h_t = o tanh(c_t)
//   GRU   u = s(W_z z + b_z), r = s(W_r z + b_r),
//         n = tanh(W_h [r h_{t-1}, x_t] + b_h), h_t = (1 - u) h_{t-1} + u n
//         (u, r, n are z_t, r_t and the candidate of the page)
//   RNN   h_t = tanh(W z + b)
// and y_t = softmax(W_y h_t + b_y). The parameters live in one flat array:
// the gate rows (G H rows of H + D weights), their biases, W_y and b_y.
// The weights start uniform in [-1/sqrt(H), 1/sqrt(H)], the biases at 0 except
// those of the forget gates of the LSTM, at 3 (f = 0.95), and those of the
// update gates of the GRU, at -3 (u = 0.05), so that c, or h in the GRU, carries
// its content over the first tens of steps before anything is learnt.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNet(kind, H, D, K, seed, forget = 3) {
  const G = kind === 'lstm' ? 4 : kind === 'gru' ? 3 : 1, Z = H + D, R = G * H;
  const n = R * Z + R + K * H + K;
  const net = { kind, H, D, K, G, Z, R, n,
    oW: 0, ob: R * Z, oWy: R * Z + R, oby: R * Z + R + K * H,
    p: new Float64Array(n), g: new Float64Array(n), m: new Float64Array(n), v: new Float64Array(n), t: 0 };
  const r = rng(seed), s = 1 / Math.sqrt(H);
  for (let k = 0; k < net.ob; k++) net.p[k] = (2 * r() - 1) * s;
  for (let k = net.oWy; k < net.oby; k++) net.p[k] = (2 * r() - 1) * s;
  if (G === 4) for (let j = 0; j < H; j++) net.p[net.ob + j] = forget;
  if (G === 3) for (let j = 0; j < H; j++) net.p[net.ob + j] = -forget;
  return net;
}

const sig = x => 1 / (1 + Math.exp(-x));

// the forward pass over the symbols xs; returns the states, the gates (LSTM:
// f, i, g, o, each of H values, per step; GRU: u, r, n) and the probabilities
// at the outputs
export function forward(net, xs, outs) {
  const { H, Z, R, G, K, p, oW, ob, oWy, oby } = net, T = xs.length;
  const h = new Float64Array((T + 1) * H), c = new Float64Array((T + 1) * H);
  const a = new Float64Array(T * R), tc = new Float64Array(T * H);
  const pre = new Float64Array(R), rh = new Float64Array(H);
  for (let t = 0; t < T; t++) {
    const hp = t * H, x = xs[t];
    // the rows of the candidate of the GRU read r h_{t-1}, computed below
    for (let r = 0; r < (G === 3 ? 2 * H : R); r++) {
      let s = p[ob + r] + p[oW + r * Z + H + x];
      const w = oW + r * Z;
      for (let j = 0; j < H; j++) s += p[w + j] * h[hp + j];
      pre[r] = s;
    }
    const at = t * R, hn = (t + 1) * H;
    if (G === 4) {
      for (let j = 0; j < H; j++) {
        const f = sig(pre[j]), i = sig(pre[H + j]), g = Math.tanh(pre[2 * H + j]), o = sig(pre[3 * H + j]);
        a[at + j] = f; a[at + H + j] = i; a[at + 2 * H + j] = g; a[at + 3 * H + j] = o;
        const cc = f * c[hp + j] + i * g, th = Math.tanh(cc);
        c[hn + j] = cc; tc[t * H + j] = th; h[hn + j] = o * th;
      }
    } else if (G === 3) {
      for (let j = 0; j < H; j++) { a[at + j] = sig(pre[j]); a[at + H + j] = sig(pre[H + j]); rh[j] = a[at + H + j] * h[hp + j]; }
      for (let j = 0; j < H; j++) {
        const r = 2 * H + j, w = oW + r * Z;
        let s = p[ob + r] + p[w + H + x];
        for (let k = 0; k < H; k++) s += p[w + k] * rh[k];
        const u = a[at + j], n = Math.tanh(s);
        a[at + 2 * H + j] = n; h[hn + j] = (1 - u) * h[hp + j] + u * n;
      }
    } else {
      for (let j = 0; j < H; j++) { const v = Math.tanh(pre[j]); a[at + j] = v; h[hn + j] = v; }
    }
  }
  // the outputs: probabilities at the steps of outs ({t, y})
  const P = outs.map(({ t }) => {
    const z = new Float64Array(K), hn = (t + 1) * H;
    let mx = -Infinity;
    for (let k = 0; k < K; k++) {
      let s = p[oby + k];
      for (let j = 0; j < H; j++) s += p[oWy + k * H + j] * h[hn + j];
      z[k] = s; if (s > mx) mx = s;
    }
    let sum = 0;
    for (let k = 0; k < K; k++) { z[k] = Math.exp(z[k] - mx); sum += z[k]; }
    for (let k = 0; k < K; k++) z[k] /= sum;
    return z;
  });
  let loss = 0;
  outs.forEach(({ y }, q) => { loss -= Math.log(Math.max(1e-12, P[q][y])); });
  return { T, h, c, a, tc, P, loss: loss / outs.length };
}

// backpropagation through time: adds the gradient of the loss (mean over the
// outputs) to net.g and returns |dL/dh_t| for t = 0..T-1 (the total derivative,
// through all the later steps); with lastOnly only the last output counts
export function backward(net, xs, outs, F, lastOnly = false) {
  const { H, Z, R, G, K, p, g, oW, ob, oWy, oby } = net, T = xs.length;
  const used = lastOnly ? [outs.length - 1] : outs.map((_, q) => q);
  const scale = 1 / used.length;
  const dhOut = new Float64Array(T * H);   // dL/dh_t from the outputs read at t
  for (const q of used) {
    const { t, y } = outs[q], P = F.P[q], hn = (t + 1) * H;
    for (let k = 0; k < K; k++) {
      const d = (P[k] - (k === y ? 1 : 0)) * scale;
      g[oby + k] += d;
      for (let j = 0; j < H; j++) { g[oWy + k * H + j] += d * F.h[hn + j]; dhOut[t * H + j] += d * p[oWy + k * H + j]; }
    }
  }
  const norms = new Float64Array(T);
  let dh = new Float64Array(H), dc = new Float64Array(H);
  const dpre = new Float64Array(R), drh = new Float64Array(H);
  for (let t = T - 1; t >= 0; t--) {
    const hp = t * H, at = t * R;
    let nn = 0;
    for (let j = 0; j < H; j++) { dh[j] += dhOut[t * H + j]; nn += dh[j] * dh[j]; }
    norms[t] = Math.sqrt(nn);
    if (G === 4) {
      for (let j = 0; j < H; j++) {
        const f = F.a[at + j], i = F.a[at + H + j], gg = F.a[at + 2 * H + j], o = F.a[at + 3 * H + j], th = F.tc[t * H + j];
        const dcj = dc[j] + dh[j] * o * (1 - th * th);
        dpre[j] = dcj * F.c[hp + j] * f * (1 - f);
        dpre[H + j] = dcj * gg * i * (1 - i);
        dpre[2 * H + j] = dcj * i * (1 - gg * gg);
        dpre[3 * H + j] = dh[j] * th * o * (1 - o);
        dc[j] = dcj * f;
      }
    } else if (G === 3) {
      // the candidate first: its rows read r h_{t-1}, whose gradient gives
      // that of r and part of that of h_{t-1}
      for (let j = 0; j < H; j++) { const u = F.a[at + j], n = F.a[at + 2 * H + j]; dpre[j] = dh[j] * (n - F.h[hp + j]) * u * (1 - u); dpre[2 * H + j] = dh[j] * u * (1 - n * n); }
      drh.fill(0);
      const x = xs[t];
      for (let j = 0; j < H; j++) {
        const r = 2 * H + j, d = dpre[r], w = oW + r * Z;
        if (d === 0) continue;
        g[ob + r] += d; g[w + H + x] += d;
        for (let k = 0; k < H; k++) { g[w + k] += d * F.a[at + H + k] * F.h[hp + k]; drh[k] += d * p[w + k]; }
      }
      for (let j = 0; j < H; j++) { const r = F.a[at + H + j]; dpre[H + j] = drh[j] * F.h[hp + j] * r * (1 - r); }
    } else {
      for (let j = 0; j < H; j++) { const v = F.a[at + j]; dpre[j] = dh[j] * (1 - v * v); }
    }
    const nh = new Float64Array(H), x = xs[t];
    if (G === 3) for (let j = 0; j < H; j++) nh[j] = dh[j] * (1 - F.a[at + j]) + drh[j] * F.a[at + H + j];
    for (let r = 0; r < (G === 3 ? 2 * H : R); r++) {
      const d = dpre[r], w = oW + r * Z;
      if (d === 0) continue;
      g[ob + r] += d; g[w + H + x] += d;
      for (let j = 0; j < H; j++) { g[w + j] += d * F.h[hp + j]; nh[j] += d * p[w + j]; }
    }
    dh = nh;
  }
  return norms;
}

// one step of Adam on the gradient accumulated in net.g (divided by m), with
// the gradient clipped to norm clip; clears net.g
export function adam(net, lr, m, clip = 1) {
  const { p, g, v } = net, M = net.m;
  let nn = 0;
  for (let k = 0; k < net.n; k++) { g[k] /= m; nn += g[k] * g[k]; }
  const s = Math.sqrt(nn) > clip ? clip / Math.sqrt(nn) : 1;
  net.t++;
  const b1 = 0.9, b2 = 0.999, c1 = 1 - b1 ** net.t, c2 = 1 - b2 ** net.t;
  for (let k = 0; k < net.n; k++) {
    const gk = g[k] * s;
    M[k] = b1 * M[k] + (1 - b1) * gk; v[k] = b2 * v[k] + (1 - b2) * gk * gk;
    p[k] -= lr * (M[k] / c1) / (Math.sqrt(v[k] / c2) + 1e-8);
    g[k] = 0;
  }
}

// the class predicted at each output
export const argmax = P => { let b = 0; for (let k = 1; k < P.length; k++) if (P[k] > P[b]) b = k; return b; };

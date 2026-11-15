// Scene N: an autoencoder with a code of 2 numbers, and its variational
// version, after Hinton and Salakhutdinov (2006) and Kingma and Welling (2014),
// written with its own backward pass. Encoder D -> H (ReLU) -> 2 (the code z)
// or -> 4 (the mean mu and the log-variance lv of q(z | x)); decoder 2 -> H
// (ReLU) -> D, with a sigmoid on the output and the binary cross-entropy as the
// reconstruction loss. The VAE samples z = mu + exp(lv / 2) * eps and adds
// beta times the KL divergence of q(z | x) from N(0, I); everything is
// trained with Adam.

import { rng } from './nn.js';
import { N } from './convnet.js';

export const D = N * N, Z = 2;
export const PARAMS = ['W1', 'b1', 'W2', 'b2', 'W3', 'b3', 'W4', 'b4'];
const LV = 8;                             // |lv| is clamped to LV, so that exp stays finite

export function gaussian(r) {
  let u = 0; while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export function makeModel(vae, H = 128, seed = 1) {
  const r = rng(seed * 7919 + 3), O = vae ? 2 * Z : Z;
  const he = (n, fanIn) => Float64Array.from({ length: n }, () => gaussian(r) * Math.sqrt(2 / fanIn));
  const m = {
    vae, H, O,
    W1: he(H * D, D), b1: new Float64Array(H).fill(0.01),
    W2: he(O * H, H).map(v => v / 2), b2: new Float64Array(O),
    W3: he(H * Z, Z), b3: new Float64Array(H).fill(0.01),
    W4: he(D * H, H), b4: new Float64Array(D).fill(-2),
  };
  m.opt = { t: 0, m: zeroGrads(m), v: zeroGrads(m) };
  return m;
}

export function zeroGrads(m) {
  const g = {};
  for (const p of PARAMS) g[p] = new Float64Array(m[p].length);
  return g;
}

// the encoder: h1 = ReLU(W1 x + b1), o = W2 h1 + b2; the inked pixels only
export function encode(m, x) {
  const { H, O, W1, b1, W2, b2 } = m, nz = [];
  for (let k = 0; k < D; k++) if (x[k] !== 0) nz.push(k);
  const h1 = new Float64Array(H), o = new Float64Array(O);
  for (let i = 0; i < H; i++) {
    let s = b1[i]; const row = i * D;
    for (const k of nz) s += W1[row + k] * x[k];
    h1[i] = s > 0 ? s : 0;
  }
  for (let q = 0; q < O; q++) {
    let s = b2[q]; const row = q * H;
    for (let i = 0; i < H; i++) s += W2[row + i] * h1[i];
    o[q] = s;
  }
  return { nz, h1, o };
}

// the decoder: h2 = ReLU(W3 z + b3), a = W4 h2 + b4, y = sigmoid(a)
export function decode(m, z, out = null) {
  const { H, W3, b3, W4, b4 } = m, h2 = new Float64Array(H), on = [];
  for (let j = 0; j < H; j++) {
    const s = b3[j] + W3[j * Z] * z[0] + W3[j * Z + 1] * z[1];
    if (s > 0) { h2[j] = s; on.push(j); }
  }
  const a = new Float64Array(D), y = out || new Float64Array(D);
  for (let k = 0; k < D; k++) {
    let s = b4[k]; const row = k * H;
    for (const j of on) s += W4[row + j] * h2[j];
    a[k] = s; y[k] = 1 / (1 + Math.exp(-s));
  }
  return { h2, on, a, y };
}

// the code of a digit: z for the autoencoder, the mean mu for the VAE
export function code(m, x) { const { o } = encode(m, x); return [o[0], o[1]]; }

const clampLv = v => Math.max(-LV, Math.min(LV, v));

// one forward pass; eps is the noise of the reparametrization (VAE only)
export function forward(m, x, eps) {
  const e = encode(m, x), mu = [e.o[0], e.o[1]];
  let lv = null, z = mu;
  if (m.vae) {
    lv = [clampLv(e.o[2]), clampLv(e.o[3])];
    z = [mu[0] + Math.exp(lv[0] / 2) * eps[0], mu[1] + Math.exp(lv[1] / 2) * eps[1]];
  }
  return { x, eps, ...e, mu, lv, z, ...decode(m, z) };
}

// the reconstruction term (binary cross-entropy with the logits, summed over
// the pixels) and the KL divergence of N(mu, diag exp lv) from N(0, I)
export function losses(m, c) {
  let rec = 0;
  for (let k = 0; k < D; k++) { const a = c.a[k]; rec += Math.max(a, 0) - a * c.x[k] + Math.log1p(Math.exp(-Math.abs(a))); }
  let kl = 0;
  if (m.vae) for (let q = 0; q < Z; q++) kl += 0.5 * (c.mu[q] * c.mu[q] + Math.exp(c.lv[q]) - 1 - c.lv[q]);
  return { rec, kl };
}
export const objective = (m, c, beta) => { const L = losses(m, c); return L.rec + (m.vae ? beta * L.kl : 0); };

// accumulates into g the gradient of rec + beta kl, times s
export function backward(m, c, beta, g, s = 1) {
  const { H, O, W2, W3, W4 } = m, { x, h1, h2, on, y, nz } = c;
  const dh2 = new Float64Array(H);
  for (let k = 0; k < D; k++) {
    const da = s * (y[k] - x[k]), row = k * H;
    g.b4[k] += da;
    for (const j of on) { g.W4[row + j] += da * h2[j]; dh2[j] += W4[row + j] * da; }
  }
  const dz = [0, 0];
  for (const j of on) {
    const d = dh2[j];
    g.b3[j] += d; g.W3[j * Z] += d * c.z[0]; g.W3[j * Z + 1] += d * c.z[1];
    dz[0] += W3[j * Z] * d; dz[1] += W3[j * Z + 1] * d;
  }
  const dout = new Float64Array(O);
  if (m.vae) for (let q = 0; q < Z; q++) {
    const sd = Math.exp(c.lv[q] / 2), raw = c.o[Z + q];
    dout[q] = dz[q] + s * beta * c.mu[q];
    dout[Z + q] = raw > -LV && raw < LV ? dz[q] * c.eps[q] * 0.5 * sd + s * beta * 0.5 * (sd * sd - 1) : 0;
  } else { dout[0] = dz[0]; dout[1] = dz[1]; }
  for (let q = 0; q < O; q++) {
    const d = dout[q], row = q * H;
    g.b2[q] += d;
    for (let i = 0; i < H; i++) g.W2[row + i] += d * h1[i];
  }
  for (let i = 0; i < H; i++) {
    if (h1[i] <= 0) continue;
    let d = 0;
    for (let q = 0; q < O; q++) d += W2[q * H + i] * dout[q];
    if (d === 0) continue;
    g.b1[i] += d; const row = i * D;
    for (const k of nz) g.W1[row + k] += d * x[k];
  }
}

export function adam(m, g, lr, b1 = 0.9, b2 = 0.999) {
  const o = m.opt; o.t++;
  const c1 = 1 - b1 ** o.t, c2 = 1 - b2 ** o.t;
  for (const p of PARAMS) {
    const w = m[p], gp = g[p], mp = o.m[p], vp = o.v[p];
    for (let i = 0; i < w.length; i++) {
      const gi = gp[i];
      mp[i] = b1 * mp[i] + (1 - b1) * gi; vp[i] = b2 * vp[i] + (1 - b2) * gi * gi;
      w[i] -= lr * (mp[i] / c1) / (Math.sqrt(vp[i] / c2) + 1e-8);
    }
  }
}

// one step of Adam on the mean loss of a batch; returns the mean terms
export function trainBatch(m, X, ids, lr, beta, r) {
  const g = zeroGrads(m), s = 1 / ids.length;
  let rec = 0, kl = 0;
  for (const i of ids) {
    const c = forward(m, X[i], m.vae ? [gaussian(r), gaussian(r)] : null), L = losses(m, c);
    rec += L.rec * s; kl += L.kl * s;
    backward(m, c, beta, g, s);
  }
  adam(m, g, lr);
  return { rec, kl };
}

// the mean terms on a set of digits, the VAE evaluated at its mean (eps = 0)
export function evaluate(m, X, from = 0, to = X.length) {
  let rec = 0, kl = 0;
  for (let i = from; i < to; i++) { const L = losses(m, forward(m, X[i], [0, 0])); rec += L.rec; kl += L.kl; }
  return { rec, kl, n: to - from };
}

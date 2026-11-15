// The model of scene Q: leaky integrate-and-fire neurons in discrete time,
// v_t = beta v_{t-1} + I_t - theta s_{t-1}, s_t = H(v_t - theta), and a small
// spiking network (one hidden LIF layer, two outputs read by spike count or by
// membrane) trained by backpropagation through time with the surrogate
// gradient of F. Zenke and S. Ganguli, "SuperSpike" (2018), and E. O. Neftci,
// H. Mostafa and F. Zenke, "Surrogate Gradient Learning in Spiking Neural
// Networks" (2019): in the backward pass the derivative of the step H is
// replaced by that of the fast sigmoid S below. With smooth = true the forward
// pass uses S too, so that the same backward is the exact gradient of a smooth
// model (the tests check it against finite differences).

import { rng, dataset } from './nn.js';
export { rng };

// the fast sigmoid of steepness k and its derivative, S(0) = 1/2, S' integrating to 1
export const S = (u, k) => 0.5 * (1 + k * u / (1 + k * Math.abs(u)));
export const dS = (u, k) => 0.5 * k / (1 + k * Math.abs(u)) ** 2;
export const step = u => (u >= 0 ? 1 : 0);

// one neuron driven by the currents I[0..T-1], from v = 0 and no spike
export function lif(I, beta, theta) {
  const T = I.length, v = new Float64Array(T), s = new Uint8Array(T);
  let vp = 0, sp = 0;
  for (let t = 0; t < T; t++) { vp = beta * vp + I[t] - theta * sp; v[t] = vp; sp = s[t] = step(vp - theta); }
  return { v, s };
}

// the rate (spikes per step) under the input I + sigma eps_t, eps_t gaussian
// drawn from a fixed seed, so that the curve over I uses the same noise
export function rate(I, beta, theta, sigma, n = 2000, burn = 100) {
  const r = rng(12345), g = gauss(r);
  let v = 0, s = 0, c = 0;
  for (let t = 0; t < n + burn; t++) {
    v = beta * v + I + sigma * g() - theta * s; s = step(v - theta);
    if (t >= burn) c += s;
  }
  return c / n;
}
export function gauss(r) {
  return () => { const u = r() || 1e-12, w = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
}

// ------------------------------------------------------------------ coding
// a point (x, y) of [-6, 6]^2 drives D = 4 input neurons, two per coordinate:
// x+ more active as x grows, x- as it falls (and the same for y), with a level
// p in [0, 1]. Rate coding ('rate'): at every step each one spikes with
// probability p, as a Bernoulli (discrete Poisson) process; regular rate coding
// ('regular'): the same rate without the noise, a spike whenever floor(p t)
// grows; latency coding: each one spikes once, at step round((1 - p)(T - 1)),
// early when p is large.
export const D = 4;
const prob = (x, y) => { const a = Math.min(1, Math.max(0, (x + 6) / 12)), b = Math.min(1, Math.max(0, (y + 6) / 12)); return [a, 1 - a, b, 1 - b]; };
export function encode(x, y, code, T, r) {
  const X = new Uint8Array(T * D), p = prob(x, y);
  if (code === 'latency') for (let c = 0; c < D; c++) X[Math.round((1 - p[c]) * (T - 1)) * D + c] = 1;
  else if (code === 'regular') for (let t = 0; t < T; t++) for (let c = 0; c < D; c++) X[t * D + c] = Math.floor(p[c] * (t + 1) + 1e-9) - Math.floor(p[c] * t + 1e-9);
  else for (let t = 0; t < T; t++) for (let c = 0; c < D; c++) X[t * D + c] = r() < p[c] ? 1 : 0;
  return X;
}

// ------------------------------------------------------------------ network
// parameters in one vector: W1 (H x D), b1 (H), W2 (O x H), b2 (O)
export function makeNet(H, O, seed, s1 = 0.6, s2 = 0.6, d = D) {
  const n = H * d + H + O * H + O, r = rng(seed), p = new Float64Array(n);
  const net = { D: d, H, O, n, p, g: new Float64Array(n), m: new Float64Array(n), u: new Float64Array(n), it: 0 };
  net.W1 = 0; net.b1 = H * d; net.W2 = net.b1 + H; net.b2 = net.W2 + O * H;
  for (let k = 0; k < H * d; k++) p[k] = s1 * (2 * r() - 1);
  for (let k = 0; k < H; k++) p[net.b1 + k] = 0.02;
  for (let k = 0; k < O * H; k++) p[net.W2 + k] = s2 * (2 * r() - 1);
  return net;
}

// o = { beta, theta, k, read: 'count' | 'membrane', lam, smooth, detach }.
// X holds T x D input spikes; y the class (or undefined). The outputs are LIF
// neurons whose spike counts are the logits ('count'), or leaky integrators
// without threshold whose mean membrane is ('membrane'). The loss is the
// cross-entropy plus lam times the mean firing rate of the hidden layer.
export function forward(net, X, T, o, y) {
  const { D: Dn, H, O, p } = net, { beta, theta, k } = o, count = o.read !== 'membrane';
  const v = new Float64Array(T * H), s = new Float64Array(T * H), w = new Float64Array(T * O), z = new Float64Array(T * O);
  const hv = new Float64Array(H), hr = new Float64Array(H), ov = new Float64Array(O), or = new Float64Array(O);
  const fire = u => (o.smooth ? S(u, k) : step(u)), reset = u => (o.smooth && !o.detach ? S(u, k) : step(u));
  let spikes = 0;
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < H; i++) {
      let a = beta * hv[i] + p[net.b1 + i] - theta * hr[i];
      for (let d = 0; d < Dn; d++) if (X[t * Dn + d]) a += p[net.W1 + i * Dn + d] * X[t * Dn + d];
      hv[i] = v[t * H + i] = a;
      s[t * H + i] = fire(a - theta); hr[i] = reset(a - theta); spikes += s[t * H + i];
    }
    for (let j = 0; j < O; j++) {
      let a = beta * ov[j] + p[net.b2 + j];
      for (let i = 0; i < H; i++) a += p[net.W2 + j * H + i] * s[t * H + i];
      if (count) { a -= theta * or[j]; z[t * O + j] = fire(a - theta); or[j] = reset(a - theta); }
      ov[j] = w[t * O + j] = a;
    }
  }
  const logit = new Float64Array(O);
  for (let t = 0; t < T; t++) for (let j = 0; j < O; j++) logit[j] += count ? z[t * O + j] : w[t * O + j] / T;
  const mx = Math.max(...logit), P = new Float64Array(O);
  let Z = 0; for (let j = 0; j < O; j++) Z += (P[j] = Math.exp(logit[j] - mx));
  for (let j = 0; j < O; j++) P[j] /= Z;
  const r = spikes / (T * H), ce = y === undefined ? 0 : -Math.log(Math.max(P[y], 1e-300));
  return { v, s, w, z, logit, P, rate: r, ce, loss: ce + (o.lam || 0) * r };
}

// backpropagation through time, accumulating dL/dparams into net.g; the
// derivative of every spike with respect to its membrane is dS(v - theta). With
// detach the reset -theta s_{t-1} carries no gradient (as in the libraries).
export function backward(net, X, T, F, o, y) {
  const { D: Dn, H, O, p, g } = net, { beta, theta, k } = o, count = o.read !== 'membrane', lam = o.lam || 0;
  const rs = o.detach ? 0 : theta;
  const gl = new Float64Array(O);
  for (let j = 0; j < O; j++) gl[j] = F.P[j] - (j === y ? 1 : 0);
  let dw1 = new Float64Array(O), dw0 = new Float64Array(O), dv1 = new Float64Array(H), dv0 = new Float64Array(H);
  for (let t = T - 1; t >= 0; t--) {
    for (let j = 0; j < O; j++) {
      let dw;
      if (count) dw = (gl[j] - rs * dw1[j]) * dS(F.w[t * O + j] - theta, k) + beta * dw1[j];
      else dw = gl[j] / T + beta * dw1[j];
      dw0[j] = dw; g[net.b2 + j] += dw;
      for (let i = 0; i < H; i++) g[net.W2 + j * H + i] += dw * F.s[t * H + i];
    }
    for (let i = 0; i < H; i++) {
      let ds = lam / (T * H) - rs * dv1[i];
      for (let j = 0; j < O; j++) ds += p[net.W2 + j * H + i] * dw0[j];
      const dv = ds * dS(F.v[t * H + i] - theta, k) + beta * dv1[i];
      dv0[i] = dv; g[net.b1 + i] += dv;
      for (let d = 0; d < Dn; d++) if (X[t * Dn + d]) g[net.W1 + i * Dn + d] += dv * X[t * Dn + d];
    }
    [dw1, dw0] = [dw0, dw1]; [dv1, dv0] = [dv0, dv1];
  }
}

export function adam(net, lr, scale) {
  const { n, p, g, m, u } = net, b1 = 0.9, b2 = 0.999;
  net.it++;
  const c1 = 1 - b1 ** net.it, c2 = 1 - b2 ** net.it;
  for (let q = 0; q < n; q++) {
    const gq = g[q] * scale;
    m[q] = b1 * m[q] + (1 - b1) * gq; u[q] = b2 * u[q] + (1 - b2) * gq * gq;
    p[q] -= lr * (m[q] / c1) / (Math.sqrt(u[q] / c2) + 1e-8);
    g[q] = 0;
  }
}

// ------------------------------------------------------------------ a run
// 400 points of a data set of the network scene, half to train and half to
// test; an epoch is 10 minibatches of 20, each point coded anew (for rate
// coding the spikes are drawn again); the test points keep one coding.
export const BETA = 0.9, THETA = 1, BATCH = 20;
export function createRun(c) {
  const run = { ...c, epoch: 0, hist: [] };
  const r = rng(c.seed * 31 + 1), pts = dataset(c.data, 400, 0, r);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  pts.forEach(q => { q.c = q.label > 0 ? 1 : 0; });   // the class, 1 the violet one
  run.train = pts.slice(0, 200); run.test = pts.slice(200);
  const lat = c.code === 'latency';
  run.net = makeNet(c.H, 2, c.seed, lat ? 1.2 : 0.6, lat ? 1 : 0.6);
  const er = rng(c.seed * 7 + 5);
  run.opts = () => ({ beta: BETA, theta: THETA, k: run.k, read: run.read, lam: run.lam, detach: true });
  run.testX = run.test.map(q => encode(q.x, q.y, c.code, c.T, er));
  run.trainEpoch = () => {
    const o = run.opts(), idx = run.train.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(er() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let b = 0; b < idx.length; b += BATCH) {
      const B = idx.slice(b, b + BATCH);
      for (const i of B) {
        const q = run.train[i], X = encode(q.x, q.y, c.code, c.T, er), F = forward(run.net, X, c.T, o, q.c);
        backward(run.net, X, c.T, F, o, q.c);
      }
      adam(run.net, run.lr, 1 / B.length);
    }
    run.epoch++;
  };
  // the test loss, accuracy, mean rate, the share of silent hidden neurons, and
  // a histogram of v - theta of the hidden neurons in [-2, 1]
  run.measure = () => {
    const o = run.opts(), H = c.H, fired = new Float64Array(H), hist = new Float64Array(60);
    let L = 0, A = 0, R = 0;
    run.test.forEach((q, n) => {
      const F = forward(run.net, run.testX[n], c.T, o, q.c);
      L += F.ce; A += (F.P[1] > F.P[0] ? 1 : 0) === q.c ? 1 : 0; R += F.rate;
      for (let t = 0; t < c.T; t++) for (let i = 0; i < H; i++) {
        fired[i] += F.s[t * H + i];
        const b = Math.floor((F.v[t * H + i] - THETA + 2) / 3 * 60);
        if (b >= 0 && b < 60) hist[b]++;
      }
    });
    const N = run.test.length, silent = fired.filter(f => f === 0).length / H;
    run.vhist = hist;
    run.hist.push({ epoch: run.epoch, loss: L / N, acc: A / N, rate: R / N, silent });
  };
  return run;
}

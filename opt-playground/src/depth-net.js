// The deep network of scene O: a stack of d fully connected layers of the same
// width on the two coordinates of the plane, each one
//   a_l = W_l h_{l-1} + b_l,   h_l = phi(N(a_l)) (+ h_{l-1} when residual),
// with N the identity, batch normalization or layer normalization, and a
// linear output o = w^T h_d + b trained with the logistic loss log(1 + e^{-y o}).
// Forward and backward are written out on a batch held row by row in flat
// arrays; the first layer has no skip connection, since its input has 2
// components and its output n.

export { rng } from './nn.js';

export const ACTS = {
  tanh: { f: x => Math.tanh(x), d: (x, y) => 1 - y * y },
  relu: { f: x => (x > 0 ? x : 0), d: x => (x > 0 ? 1 : 0) },
  sigmoid: { f: x => 1 / (1 + Math.exp(-x)), d: (x, y) => y * (1 - y) },
};
// the variance of the initial weights of a layer with nIn inputs and nOut outputs
export const INITS = {
  naive: { name: 'naive N(0, 1)', v: () => 1 },
  small: { name: 'small N(0, 0.01²)', v: () => 1e-4 },
  xavier: { name: 'Xavier / Glorot', v: (nIn, nOut) => 2 / (nIn + nOut) },
  he: { name: 'He', v: nIn => 2 / nIn },
};
const EPS = 1e-5;

function gauss(r) { const u = r() || 1e-12, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// cfg: { depth, width, act, init, norm: 'none' | 'batch' | 'layer', res, seed }
export function makeNet(cfg, r) {
  const { depth, width: n } = cfg, layers = [];
  for (let l = 0; l < depth; l++) {
    const nIn = l ? n : 2, s = Math.sqrt(INITS[cfg.init].v(nIn, n));
    const W = new Float64Array(nIn * n);
    for (let k = 0; k < W.length; k++) W[k] = s * gauss(r);
    layers.push({ nIn, W, b: new Float64Array(n), g: new Float64Array(n).fill(1), be: new Float64Array(n),
      mu: new Float64Array(n), va: new Float64Array(n).fill(1) });   // mu, va: the statistics used outside training
  }
  const so = Math.sqrt(INITS[cfg.init].v(n, 1)), wo = new Float64Array(n);
  for (let k = 0; k < n; k++) wo[k] = so * gauss(r);
  const net = { cfg: { ...cfg }, n, layers, wo, bo: new Float64Array(1) };
  net.params = params(net);
  return net;
}
// the arrays of the parameters, in a fixed order (normalization ones only when used)
function params(net) {
  const out = [];
  for (const L of net.layers) { out.push(L.W, L.b); if (net.cfg.norm !== 'none') out.push(L.g, L.be); }
  out.push(net.wo, net.bo);
  return out;
}

// X: B x 2 row by row. mode 'train' normalizes with the statistics of the batch
// (batch norm), 'eval' with the stored ones. Returns the cache for backward.
export function forward(net, X, B, mode = 'train') {
  const { n, cfg } = net, act = ACTS[cfg.act], C = [];
  let h = X;
  for (let l = 0; l < net.layers.length; l++) {
    const L = net.layers[l], nIn = L.nIn, a = new Float64Array(B * n);
    for (let i = 0; i < B; i++) for (let j = 0; j < n; j++) {
      let s = L.b[j];
      for (let k = 0; k < nIn; k++) s += h[i * nIn + k] * L.W[k * n + j];
      a[i * n + j] = s;
    }
    let z = a, xh = null, sd = null;
    if (cfg.norm === 'batch') {
      xh = new Float64Array(B * n); sd = new Float64Array(n); z = new Float64Array(B * n);
      for (let j = 0; j < n; j++) {
        let mu = L.mu[j], va = L.va[j];
        if (mode === 'train') {
          mu = 0; for (let i = 0; i < B; i++) mu += a[i * n + j]; mu /= B;
          va = 0; for (let i = 0; i < B; i++) va += (a[i * n + j] - mu) ** 2; va /= B;
        }
        sd[j] = Math.sqrt(va + EPS);
        for (let i = 0; i < B; i++) { const t = (a[i * n + j] - mu) / sd[j]; xh[i * n + j] = t; z[i * n + j] = L.g[j] * t + L.be[j]; }
      }
    } else if (cfg.norm === 'layer') {
      xh = new Float64Array(B * n); sd = new Float64Array(B); z = new Float64Array(B * n);
      for (let i = 0; i < B; i++) {
        let mu = 0; for (let j = 0; j < n; j++) mu += a[i * n + j]; mu /= n;
        let va = 0; for (let j = 0; j < n; j++) va += (a[i * n + j] - mu) ** 2; va /= n;
        sd[i] = Math.sqrt(va + EPS);
        for (let j = 0; j < n; j++) { const t = (a[i * n + j] - mu) / sd[i]; xh[i * n + j] = t; z[i * n + j] = L.g[j] * t + L.be[j]; }
      }
    }
    const f = new Float64Array(B * n), hn = new Float64Array(B * n), skip = cfg.res && l > 0;
    for (let q = 0; q < B * n; q++) { f[q] = act.f(z[q]); hn[q] = skip ? f[q] + h[q] : f[q]; }
    C.push({ hin: h, a, z, xh, sd, f, h: hn });
    h = hn;
  }
  const o = new Float64Array(B);
  for (let i = 0; i < B; i++) { let s = net.bo[0]; for (let j = 0; j < n; j++) s += h[i * n + j] * net.wo[j]; o[i] = s; }
  return { C, o, B };
}

// the mean logistic loss of the outputs o for labels y in {-1, 1}
const softplus = t => (t > 0 ? t + Math.log1p(Math.exp(-t)) : Math.log1p(Math.exp(t)));
export function lossOf(o, y) { let s = 0; for (let i = 0; i < o.length; i++) s += softplus(-y[i] * o[i]); return s / o.length; }

// the gradient of the mean loss of the batch, in arrays shaped as net.params;
// the batch statistics of batch normalization are differentiated through
export function backward(net, F, y) {
  const { n, cfg } = net, act = ACTS[cfg.act], { C, o, B } = F, d = net.layers.length;
  const G = net.params.map(p => new Float64Array(p.length)), per = cfg.norm === 'none' ? 2 : 4;
  const gwo = G[G.length - 2], gbo = G[G.length - 1];
  let dh = new Float64Array(B * n);
  const hd = C[d - 1].h;
  for (let i = 0; i < B; i++) {
    const t = -y[i] * o[i], s = 1 / (1 + Math.exp(-t)), dout = -y[i] * s / B;   // d softplus(-y o) / d o
    gbo[0] += dout;
    for (let j = 0; j < n; j++) { gwo[j] += dout * hd[i * n + j]; dh[i * n + j] = dout * net.wo[j]; }
  }
  for (let l = d - 1; l >= 0; l--) {
    const L = net.layers[l], c = C[l], k0 = l * per, gW = G[k0], gb = G[k0 + 1], nIn = L.nIn;
    const dz = new Float64Array(B * n);
    for (let q = 0; q < B * n; q++) dz[q] = dh[q] * act.d(c.z[q], c.f[q]);
    let da = dz;
    if (cfg.norm !== 'none') {
      const gg = G[k0 + 2], gbe = G[k0 + 3], dx = new Float64Array(B * n);
      for (let q = 0; q < B * n; q++) { const j = q % n; gg[j] += dz[q] * c.xh[q]; gbe[j] += dz[q]; dx[q] = dz[q] * L.g[j]; }
      da = new Float64Array(B * n);
      if (cfg.norm === 'batch') for (let j = 0; j < n; j++) {
        let m1 = 0, m2 = 0;
        for (let i = 0; i < B; i++) { m1 += dx[i * n + j]; m2 += dx[i * n + j] * c.xh[i * n + j]; }
        m1 /= B; m2 /= B;
        for (let i = 0; i < B; i++) da[i * n + j] = (dx[i * n + j] - m1 - c.xh[i * n + j] * m2) / c.sd[j];
      } else for (let i = 0; i < B; i++) {
        let m1 = 0, m2 = 0;
        for (let j = 0; j < n; j++) { m1 += dx[i * n + j]; m2 += dx[i * n + j] * c.xh[i * n + j]; }
        m1 /= n; m2 /= n;
        for (let j = 0; j < n; j++) da[i * n + j] = (dx[i * n + j] - m1 - c.xh[i * n + j] * m2) / c.sd[i];
      }
    }
    const dprev = new Float64Array(B * nIn), hin = c.hin;
    for (let i = 0; i < B; i++) for (let j = 0; j < n; j++) {
      const g = da[i * n + j];
      if (!g) continue;
      gb[j] += g;
      for (let k = 0; k < nIn; k++) { gW[k * n + j] += g * hin[i * nIn + k]; dprev[i * nIn + k] += g * L.W[k * n + j]; }
    }
    if (cfg.res && l > 0) for (let q = 0; q < B * n; q++) dprev[q] += dh[q];
    dh = dprev;
  }
  return G;
}

// the statistics that batch normalization uses outside training: those of the
// whole training set under the current weights, layer by layer
export function setStats(net, X, B) {
  if (net.cfg.norm !== 'batch') return;
  const F = forward(net, X, B, 'train'), n = net.n;
  F.C.forEach((c, l) => {
    const L = net.layers[l];
    for (let j = 0; j < n; j++) {
      let mu = 0; for (let i = 0; i < B; i++) mu += c.a[i * n + j]; mu /= B;
      let va = 0; for (let i = 0; i < B; i++) va += (c.a[i * n + j] - mu) ** 2; va /= B;
      L.mu[j] = mu; L.va[j] = va;
    }
  });
}

// the optimizers: Adam with the usual constants, or plain SGD
export function makeOpt(net, kind, lr) {
  const m = net.params.map(p => new Float64Array(p.length)), v = net.params.map(p => new Float64Array(p.length));
  let t = 0;
  return {
    kind, lr,
    step(G) {
      t++;
      const c1 = 1 - 0.9 ** t, c2 = 1 - 0.999 ** t;
      net.params.forEach((p, a) => {
        const g = G[a];
        for (let k = 0; k < p.length; k++) {
          if (!isFinite(g[k])) continue;
          if (this.kind === 'sgd') { p[k] -= this.lr * g[k]; continue; }
          m[a][k] = 0.9 * m[a][k] + 0.1 * g[k]; v[a][k] = 0.999 * v[a][k] + 0.001 * g[k] * g[k];
          p[k] -= this.lr * (m[a][k] / c1) / (Math.sqrt(v[a][k] / c2) + 1e-8);
        }
      });
    },
  };
}

// the gradient with respect to the weights W_l of every layer
export function weightGrads(net, G) { const k = net.cfg.norm === 'none' ? 2 : 4; return net.layers.map((_, l) => G[l * k]); }

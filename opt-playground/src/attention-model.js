// A tiny transformer for scene K, with its own forward and backward pass:
// token and positional embeddings, L blocks of (layer norm, multi-head
// scaled dot-product self-attention, residual; layer norm, MLP with ReLU,
// residual), a last layer norm and a linear read-out into a softmax. The
// layer norms can be switched off; all arrays are flat Float64Arrays in
// row-major order, a matrix W of a layer in -> out being W[i * out + j].

import { rng } from './nn.js';

function tensor(name, n, scale, r) {
  const data = new Float64Array(n);
  if (scale) for (let i = 0; i < n; i++) data[i] = scale * gauss(r);
  return { name, data, grad: new Float64Array(n), m: new Float64Array(n), v: new Float64Array(n) };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
const ones = t => { t.data.fill(1); return t; };

// cfg: { vocab, T (the longest sequence), d, layers, heads, hidden, ln, seed }
export function createModel(cfg) {
  const r = rng(cfg.seed * 7919 + 13), { vocab, T, d, hidden } = cfg, s = 1 / Math.sqrt(d);
  const M = { cfg, params: [], t: 0 };
  const add = t => { M.params.push(t); return t; };
  M.E = add(tensor('E', vocab * d, 0.5, r));
  M.P = add(tensor('P', T * d, 0.5, r));
  M.blocks = [];
  for (let l = 0; l < cfg.layers; l++) {
    M.blocks.push({
      g1: add(ones(tensor(`g1.${l}`, d))), b1: add(tensor(`b1.${l}`, d)),
      Wq: add(tensor(`Wq.${l}`, d * d, s, r)), Wk: add(tensor(`Wk.${l}`, d * d, s, r)),
      Wv: add(tensor(`Wv.${l}`, d * d, s, r)), Wo: add(tensor(`Wo.${l}`, d * d, s, r)), bo: add(tensor(`bo.${l}`, d)),
      g2: add(ones(tensor(`g2.${l}`, d))), b2: add(tensor(`b2.${l}`, d)),
      W1: add(tensor(`W1.${l}`, d * hidden, s, r)), c1: add(tensor(`c1.${l}`, hidden)),
      W2: add(tensor(`W2.${l}`, hidden * d, 1 / Math.sqrt(hidden), r)), c2: add(tensor(`c2.${l}`, d)),
    });
  }
  M.gf = add(ones(tensor('gf', d))); M.bf = add(tensor('bf', d));
  M.U = add(tensor('U', d * vocab, s, r)); M.bu = add(tensor('bu', vocab));
  return M;
}

// ------------------------------------------------------------ the pieces
function linear(X, n, din, W, b, dout) {
  const Y = new Float64Array(n * dout);
  for (let t = 0; t < n; t++) {
    const y = t * dout, x = t * din;
    if (b) for (let j = 0; j < dout; j++) Y[y + j] = b[j];
    for (let i = 0; i < din; i++) {
      const xi = X[x + i]; if (xi === 0) continue;
      const w = i * dout;
      for (let j = 0; j < dout; j++) Y[y + j] += xi * W[w + j];
    }
  }
  return Y;
}
// given dY, adds to dW and db and returns dX
function linearBack(dY, X, n, din, W, dW, db, dout) {
  const dX = new Float64Array(n * din);
  for (let t = 0; t < n; t++) {
    const y = t * dout, x = t * din;
    if (db) for (let j = 0; j < dout; j++) db[j] += dY[y + j];
    for (let i = 0; i < din; i++) {
      const w = i * dout, xi = X[x + i];
      let s = 0;
      for (let j = 0; j < dout; j++) { const g = dY[y + j]; s += g * W[w + j]; dW[w + j] += xi * g; }
      dX[x + i] = s;
    }
  }
  return dX;
}
function layerNorm(X, n, d, g, b, on) {
  if (!on) return { Y: X, xh: null, inv: null };
  const Y = new Float64Array(n * d), xh = new Float64Array(n * d), inv = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    let mu = 0, va = 0;
    for (let i = 0; i < d; i++) mu += X[t * d + i];
    mu /= d;
    for (let i = 0; i < d; i++) va += (X[t * d + i] - mu) ** 2;
    inv[t] = 1 / Math.sqrt(va / d + 1e-5);
    for (let i = 0; i < d; i++) { const h = (X[t * d + i] - mu) * inv[t]; xh[t * d + i] = h; Y[t * d + i] = g[i] * h + b[i]; }
  }
  return { Y, xh, inv };
}
function layerNormBack(dY, c, n, d, g, dg, db) {
  if (!c.xh) return dY;
  const dX = new Float64Array(n * d);
  for (let t = 0; t < n; t++) {
    let m1 = 0, m2 = 0;
    for (let i = 0; i < d; i++) {
      const k = t * d + i, dh = dY[k] * g[i];
      dg[i] += dY[k] * c.xh[k]; db[i] += dY[k];
      m1 += dh; m2 += dh * c.xh[k];
    }
    m1 /= d; m2 /= d;
    for (let i = 0; i < d; i++) { const k = t * d + i; dX[k] = c.inv[t] * (dY[k] * g[i] - m1 - c.xh[k] * m2); }
  }
  return dX;
}

// may query i look at key j? causal: j <= i; with a prefix P the first P
// tokens (the prompt) also see each other in both directions
export const allowed = (i, j, P) => j <= i || (P > 0 && i < P && j < P);

// tokens: an array of n ids; P: the length of the bidirectional prompt (0
// for a causal mask). Returns the cache, with logits (n x vocab) and the
// attention A[l][h] (n x n), the queries, keys, values and raw scores.
export function forward(M, tokens, P = 0) {
  const { d, vocab, heads, ln } = M.cfg, n = tokens.length, dk = d / heads, sc = 1 / Math.sqrt(dk);
  let X = new Float64Array(n * d);
  for (let t = 0; t < n; t++) for (let i = 0; i < d; i++) X[t * d + i] = M.E.data[tokens[t] * d + i] + M.P.data[t * d + i];
  const C = { tokens, n, P, x0: X, L: [] };
  for (const B of M.blocks) {
    const c = { xin: X };
    c.ln1 = layerNorm(X, n, d, B.g1.data, B.b1.data, ln);
    const a = c.ln1.Y;
    c.Q = linear(a, n, d, B.Wq.data, null, d); c.K = linear(a, n, d, B.Wk.data, null, d); c.V = linear(a, n, d, B.Wv.data, null, d);
    c.S = []; c.A = [];
    const O = new Float64Array(n * d);
    for (let h = 0; h < heads; h++) {
      const S = new Float64Array(n * n), A = new Float64Array(n * n), o = h * dk;
      for (let i = 0; i < n; i++) {
        let mx = -Infinity;
        for (let j = 0; j < n; j++) {
          if (!allowed(i, j, P)) { S[i * n + j] = NaN; continue; }
          let s = 0;
          for (let e = 0; e < dk; e++) s += c.Q[i * d + o + e] * c.K[j * d + o + e];
          S[i * n + j] = s * sc; if (S[i * n + j] > mx) mx = S[i * n + j];
        }
        let z = 0;
        for (let j = 0; j < n; j++) if (allowed(i, j, P)) { A[i * n + j] = Math.exp(S[i * n + j] - mx); z += A[i * n + j]; }
        for (let j = 0; j < n; j++) {
          const w = (A[i * n + j] /= z); if (!w) continue;
          for (let e = 0; e < dk; e++) O[i * d + o + e] += w * c.V[j * d + o + e];
        }
      }
      c.S.push(S); c.A.push(A);
    }
    c.O = O;
    const att = linear(O, n, d, B.Wo.data, B.bo.data, d);
    const X1 = new Float64Array(n * d);
    for (let k = 0; k < n * d; k++) X1[k] = X[k] + att[k];
    c.x1 = X1;
    c.ln2 = layerNorm(X1, n, d, B.g2.data, B.b2.data, ln);
    const u = linear(c.ln2.Y, n, d, B.W1.data, B.c1.data, M.cfg.hidden);
    for (let k = 0; k < u.length; k++) if (u[k] < 0) u[k] = 0;
    c.u = u;
    const mlp = linear(u, n, M.cfg.hidden, B.W2.data, B.c2.data, d);
    X = new Float64Array(n * d);
    for (let k = 0; k < n * d; k++) X[k] = X1[k] + mlp[k];
    C.L.push(c);
  }
  C.xL = X;
  C.lnf = layerNorm(X, n, d, M.gf.data, M.bf.data, ln);
  C.logits = linear(C.lnf.Y, n, d, M.U.data, M.bu.data, vocab);
  return C;
}

// softmax of the logits of position t
export function probs(M, C, t) {
  const V = M.cfg.vocab, z = C.logits.subarray(t * V, t * V + V), mx = Math.max(...z), p = Array.from(z, v => Math.exp(v - mx)), s = p.reduce((a, b) => a + b);
  return p.map(v => v / s);
}

// cross-entropy on the positions with targets[t] >= 0, divided by `norm`;
// adds the gradients into the .grad of the parameters, returns the loss
export function backward(M, C, targets, norm = 1) {
  const { d, vocab, heads, hidden } = M.cfg, n = C.n, dk = d / heads, sc = 1 / Math.sqrt(dk), P = C.P;
  const dlog = new Float64Array(n * vocab);
  let loss = 0;
  for (let t = 0; t < n; t++) {
    if (targets[t] < 0) continue;
    const p = probs(M, C, t);
    loss -= Math.log(p[targets[t]] + 1e-300) / norm;
    for (let v = 0; v < vocab; v++) dlog[t * vocab + v] = (p[v] - (v === targets[t] ? 1 : 0)) / norm;
  }
  let dX = linearBack(dlog, C.lnf.Y, n, d, M.U.data, M.U.grad, M.bu.grad, vocab);
  dX = layerNormBack(dX, C.lnf, n, d, M.gf.data, M.gf.grad, M.bf.grad);
  for (let l = M.blocks.length - 1; l >= 0; l--) {
    const B = M.blocks[l], c = C.L[l];
    // the MLP and its residual
    const du = linearBack(dX, c.u, n, hidden, B.W2.data, B.W2.grad, B.c2.grad, d);
    for (let k = 0; k < du.length; k++) if (c.u[k] <= 0) du[k] = 0;
    let da = linearBack(du, c.ln2.Y, n, d, B.W1.data, B.W1.grad, B.c1.grad, hidden);
    da = layerNormBack(da, c.ln2, n, d, B.g2.data, B.g2.grad, B.b2.grad);
    const dX1 = new Float64Array(n * d);
    for (let k = 0; k < n * d; k++) dX1[k] = dX[k] + da[k];
    // the attention and its residual
    const dO = linearBack(dX1, c.O, n, d, B.Wo.data, B.Wo.grad, B.bo.grad, d);
    const dQ = new Float64Array(n * d), dK = new Float64Array(n * d), dV = new Float64Array(n * d);
    for (let h = 0; h < heads; h++) {
      const A = c.A[h], o = h * dk;
      for (let i = 0; i < n; i++) {
        // dA_ij = dO_i . V_j, then through the softmax of row i
        const dA = new Float64Array(n);
        let dot = 0;
        for (let j = 0; j < n; j++) {
          if (!A[i * n + j]) continue;
          let s = 0;
          for (let e = 0; e < dk; e++) { s += dO[i * d + o + e] * c.V[j * d + o + e]; dV[j * d + o + e] += A[i * n + j] * dO[i * d + o + e]; }
          dA[j] = s; dot += A[i * n + j] * s;
        }
        for (let j = 0; j < n; j++) {
          const a = A[i * n + j]; if (!a) continue;
          const dS = a * (dA[j] - dot) * sc;
          for (let e = 0; e < dk; e++) { dQ[i * d + o + e] += dS * c.K[j * d + o + e]; dK[j * d + o + e] += dS * c.Q[i * d + o + e]; }
        }
      }
    }
    const a = c.ln1.Y;
    const dq = linearBack(dQ, a, n, d, B.Wq.data, B.Wq.grad, null, d);
    const dkk = linearBack(dK, a, n, d, B.Wk.data, B.Wk.grad, null, d);
    const dv = linearBack(dV, a, n, d, B.Wv.data, B.Wv.grad, null, d);
    for (let k = 0; k < n * d; k++) dq[k] += dkk[k] + dv[k];
    const dln = layerNormBack(dq, c.ln1, n, d, B.g1.data, B.g1.grad, B.b1.grad);
    dX = new Float64Array(n * d);
    for (let k = 0; k < n * d; k++) dX[k] = dX1[k] + dln[k];
  }
  for (let t = 0; t < n; t++) for (let i = 0; i < d; i++) {
    M.E.grad[C.tokens[t] * d + i] += dX[t * d + i]; M.P.grad[t * d + i] += dX[t * d + i];
  }
  return loss;
}

export function zeroGrad(M) { for (const p of M.params) p.grad.fill(0); }

// Adam on the accumulated gradients, after clipping their norm to 1
export function adam(M, lr, b1 = 0.9, b2 = 0.98) {
  let nn = 0;
  for (const p of M.params) for (let i = 0; i < p.grad.length; i++) nn += p.grad[i] ** 2;
  const clip = Math.min(1, 1 / (Math.sqrt(nn) + 1e-12));
  M.t++;
  const c1 = 1 - b1 ** M.t, c2 = 1 - b2 ** M.t;
  for (const p of M.params) {
    const { data, grad, m, v } = p;
    for (let i = 0; i < data.length; i++) {
      const g = grad[i] * clip;
      m[i] = b1 * m[i] + (1 - b1) * g; v[i] = b2 * v[i] + (1 - b2) * g * g;
      data[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8);
    }
  }
}

// The maps of scene M: squared distances, principal components by subspace
// iteration on the covariance, t-SNE (van der Maaten and Hinton, 2008) with the
// exact O(n^2) gradient, the k-nearest-neighbour accuracy of a space and a
// two-dimensional linear probe. Every routine works on a slice, so that the
// page can spread it over the frames. The points of a layer are a flat n x d
// Float64Array.

import { rng } from './nn.js';

// ------------------------------------------------------------------ distances
// rows i0..i1-1 of the matrix of squared distances (both halves are written)
export function sqdist(X, n, d, D, i0, i1) {
  for (let i = i0; i < i1; i++) {
    D[i * n + i] = 0;
    for (let j = i + 1; j < n; j++) {
      let s = 0;
      for (let k = 0, a = i * d, b = j * d; k < d; k++) { const t = X[a + k] - X[b + k]; s += t * t; }
      D[i * n + j] = D[j * n + i] = s;
    }
  }
}

// the squared distances of a point x to the n points of X
export function distTo(X, n, d, x) {
  const r = new Float64Array(n);
  for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < d; k++) { const t = X[j * d + k] - x[k]; s += t * t; } r[j] = s; }
  return r;
}

// ------------------------------------------------------------------ t-SNE
// the Gaussian row p_{j|i} whose entropy is log(perplexity), found by bisection
// on the precision beta = 1 / (2 sigma_i^2); dist is the row of squared
// distances, `self` the index to leave out (or -1); returns the row, sum 1
export function gaussRow(dist, self, perp) {
  const n = dist.length, p = new Float64Array(n), H0 = Math.log(perp);
  let mn = Infinity;
  for (let j = 0; j < n; j++) if (j !== self && dist[j] < mn) mn = dist[j];
  let lo = 0, hi = Infinity, beta = 1, mean = 0, c = 0;
  for (let j = 0; j < n; j++) if (j !== self) { mean += dist[j] - mn; c++; }
  beta = c / Math.max(mean, 1e-12);
  for (let it = 0; it < 64; it++) {
    let S = 0, E = 0;
    for (let j = 0; j < n; j++) {
      if (j === self) { p[j] = 0; continue; }
      const e = Math.exp(-beta * (dist[j] - mn)); p[j] = e; S += e; E += e * (dist[j] - mn);
    }
    const H = Math.log(S) + beta * E / S;                  // the entropy of the row
    for (let j = 0; j < n; j++) p[j] /= S;
    if (Math.abs(H - H0) < 1e-6) break;
    if (H > H0) { lo = beta; beta = hi === Infinity ? 2 * beta : (beta + hi) / 2; }
    else { hi = beta; beta = (lo + beta) / 2; }
  }
  return p;
}

// rows i0..i1-1 of the conditional matrix p_{j|i}
export function condRows(D, n, perp, Pc, i0, i1) {
  for (let i = i0; i < i1; i++) Pc.set(gaussRow(D.subarray(i * n, (i + 1) * n), i, perp), i * n);
}

// p_ij = (p_{j|i} + p_{i|j}) / 2n
export function symmetrize(Pc, n) {
  const P = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const v = Math.max((Pc[i * n + j] + Pc[j * n + i]) / (2 * n), 1e-12);
    P[i * n + j] = P[j * n + i] = v;
  }
  return P;
}

export class TSNE {
  constructor(n, Y0) {
    this.n = n; this.Y = Float64Array.from(Y0);
    this.gains = new Float64Array(2 * n).fill(1); this.upd = new Float64Array(2 * n);
    this.iter = 0; this.W = new Float64Array(n * n);
  }
  // a fresh start of the optimizer on new affinities, from the current layout
  restart() { this.gains.fill(1); this.upd.fill(0); this.iter = 0; }
  // one step of gradient descent with momentum and the gains of Jacobs (1988)
  step(P, { exag = 1, mom = 0.8, lr = 100 } = {}) {
    const { n, Y, W, gains, upd } = this, G = new Float64Array(2 * n);
    let Z = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = Y[2 * i] - Y[2 * j], dy = Y[2 * i + 1] - Y[2 * j + 1], w = 1 / (1 + dx * dx + dy * dy);
      W[i * n + j] = w; Z += 2 * w;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const w = W[i * n + j], f = 4 * (exag * P[i * n + j] - w / Z) * w;
      const fx = f * (Y[2 * i] - Y[2 * j]), fy = f * (Y[2 * i + 1] - Y[2 * j + 1]);
      G[2 * i] += fx; G[2 * i + 1] += fy; G[2 * j] -= fx; G[2 * j + 1] -= fy;
    }
    let mx = 0, my = 0;
    for (let k = 0; k < 2 * n; k++) {
      gains[k] = Math.sign(G[k]) !== Math.sign(upd[k]) ? gains[k] + 0.2 : Math.max(0.01, gains[k] * 0.8);
      upd[k] = mom * upd[k] - lr * gains[k] * G[k];
      Y[k] += upd[k];
    }
    for (let i = 0; i < n; i++) { mx += Y[2 * i]; my += Y[2 * i + 1]; }
    mx /= n; my /= n;
    for (let i = 0; i < n; i++) { Y[2 * i] -= mx; Y[2 * i + 1] -= my; }
    this.iter++;
  }
}

// KL(P || Q) of a layout
export function klDivergence(P, Y, n) {
  let Z = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = Y[2 * i] - Y[2 * j], dy = Y[2 * i + 1] - Y[2 * j + 1]; Z += 2 / (1 + dx * dx + dy * dy);
  }
  let kl = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = Y[2 * i] - Y[2 * j], dy = Y[2 * i + 1] - Y[2 * j + 1], q = 1 / (1 + dx * dx + dy * dy) / Z, p = P[i * n + j];
    kl += 2 * p * Math.log(p / Math.max(q, 1e-300));
  }
  return kl;
}

// where t-SNE would put a new point, without moving the others: the mean of
// the positions of the n points weighted by its own row p_{j|new}
export function placeNew(dist, Y, perp) {
  const p = gaussRow(dist, -1, perp);
  let x = 0, y = 0;
  for (let j = 0; j < p.length; j++) { x += p[j] * Y[2 * j]; y += p[j] * Y[2 * j + 1]; }
  return [x, y];
}

// ------------------------------------------------------------------ principal components
// the covariance is accumulated over the points i0..i1-1 (call with the
// mean first), then the two leading eigenvectors are found by subspace
// iteration with a Rayleigh-Ritz step, warm-started from the previous axes
export function mean(X, n, d) {
  const m = new Float64Array(d);
  for (let i = 0; i < n; i++) for (let k = 0; k < d; k++) m[k] += X[i * d + k];
  for (let k = 0; k < d; k++) m[k] /= n;
  return m;
}
export function covRows(X, n, d, m, C, i0, i1) {
  const c = new Float64Array(d);
  for (let i = i0; i < i1; i++) {
    for (let k = 0; k < d; k++) c[k] = X[i * d + k] - m[k];
    for (let a = 0; a < d; a++) { const ca = c[a] / n; if (ca === 0) continue; for (let b = a; b < d; b++) C[a * d + b] += ca * c[b]; }
  }
}
export function symFill(C, d) { for (let a = 0; a < d; a++) for (let b = 0; b < a; b++) C[a * d + b] = C[b * d + a]; }

function orthonormalize(V, d) {             // the two columns of V (d x 2, row major)
  let s = 0; for (let k = 0; k < d; k++) s += V[2 * k] ** 2;
  s = Math.sqrt(s) || 1; for (let k = 0; k < d; k++) V[2 * k] /= s;
  let p = 0; for (let k = 0; k < d; k++) p += V[2 * k] * V[2 * k + 1];
  for (let k = 0; k < d; k++) V[2 * k + 1] -= p * V[2 * k];
  s = 0; for (let k = 0; k < d; k++) s += V[2 * k + 1] ** 2;
  s = Math.sqrt(s) || 1; for (let k = 0; k < d; k++) V[2 * k + 1] /= s;
}
function mulCV(C, V, d) {
  const W = new Float64Array(2 * d);
  for (let a = 0; a < d; a++) { let s0 = 0, s1 = 0; for (let b = 0; b < d; b++) { const c = C[a * d + b]; s0 += c * V[2 * b]; s1 += c * V[2 * b + 1]; } W[2 * a] = s0; W[2 * a + 1] = s1; }
  return W;
}

export class PCA {
  constructor(C, d, V0 = null, seed = 1) {
    this.C = C; this.d = d; this.prev = V0;
    if (V0) this.V = Float64Array.from(V0);
    else { const r = rng(seed); this.V = Float64Array.from({ length: 2 * d }, () => r() - 0.5); }
    orthonormalize(this.V, d); this.done = false; this.lambda = [0, 0]; this.its = 0;
  }
  // k iterations; true once the subspace has stopped moving
  iterate(k) {
    const { C, d } = this;
    for (let t = 0; t < k && !this.done; t++) {
      const W = mulCV(C, this.V, d);
      orthonormalize(W, d);
      let ch = 0;                                           // 1 - |cos| of the change, on the plane
      for (let c = 0; c < 2; c++) { let p = 0, q = 0; for (let a = 0; a < d; a++) { p += W[2 * a + c] * this.V[2 * a]; q += W[2 * a + c] * this.V[2 * a + 1]; } ch = Math.max(ch, 1 - Math.hypot(p, q)); }
      this.V = W; this.its++;
      if (ch < 1e-12 || this.its >= 3000) this.done = true;
    }
    if (this.done) this.ritz();
    return this.done;
  }
  // the 2 x 2 problem on the plane: the columns become the eigenvectors,
  // ordered by eigenvalue, with the signs of the previous axes
  ritz() {
    const { C, d, V } = this, W = mulCV(C, V, d);
    let a = 0, b = 0, c = 0;
    for (let k = 0; k < d; k++) { a += V[2 * k] * W[2 * k]; b += V[2 * k] * W[2 * k + 1]; c += V[2 * k + 1] * W[2 * k + 1]; }
    const th = 0.5 * Math.atan2(2 * b, a - c), co = Math.cos(th), si = Math.sin(th);
    for (let k = 0; k < d; k++) { const u = V[2 * k], v = V[2 * k + 1]; V[2 * k] = co * u + si * v; V[2 * k + 1] = -si * u + co * v; }
    const l1 = co * co * a + 2 * co * si * b + si * si * c, l2 = si * si * a - 2 * co * si * b + co * co * c;
    if (l2 > l1) { for (let k = 0; k < d; k++) { const t = V[2 * k]; V[2 * k] = V[2 * k + 1]; V[2 * k + 1] = t; } this.lambda = [l2, l1]; }
    else this.lambda = [l1, l2];
    if (this.prev) for (let col = 0; col < 2; col++) {
      let p = 0; for (let k = 0; k < d; k++) p += V[2 * k + col] * this.prev[2 * k + col];
      if (p < 0) for (let k = 0; k < d; k++) V[2 * k + col] = -V[2 * k + col];
    }
  }
}

// the coordinates of the points on the axes V
export function project(X, n, d, m, V) {
  const Y = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < d; k++) { const c = X[i * d + k] - m[k]; Y[2 * i] += c * V[2 * k]; Y[2 * i + 1] += c * V[2 * k + 1]; }
  return Y;
}

// ------------------------------------------------------------------ neighbours
// the k nearest points of i (itself left out), nearest first
export function neighbours(D, n, i, k) {
  const best = [];
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    const v = D[i * n + j];
    if (best.length < k || v < best[best.length - 1][0]) {
      let at = best.length; while (at > 0 && best[at - 1][0] > v) at--;
      best.splice(at, 0, [v, j]); if (best.length > k) best.pop();
    }
  }
  return best.map(b => b[1]);
}

// leave-one-out accuracy of the vote of the k nearest neighbours; a tie goes
// to the class of the nearest among the tied
export function knnAccuracy(D, n, Y, k = 5) {
  let ok = 0;
  const votes = new Int32Array(10);
  for (let i = 0; i < n; i++) {
    const nb = neighbours(D, n, i, k);
    votes.fill(0); for (const j of nb) votes[Y[j]]++;
    let top = 0; for (const v of votes) top = Math.max(top, v);
    const c = Y[nb.find(j => votes[Y[j]] === top)];
    if (c === Y[i]) ok++;
  }
  return ok / n;
}

// ------------------------------------------------------------------ a linear probe in 2D
// z = A (x - m) s, then a softmax classifier on z, trained together with Adam
// on a set of points (full batch): the plane that a linear classifier finds
// most useful; it is fitted on other points than those it is drawn on, since
// 500 points in 400 dimensions are separable by almost any plane
export class Probe {
  constructor(d, seed = 1) {
    const r = rng(seed * 31 + 5);
    this.d = d; this.A = Float64Array.from({ length: 2 * d }, () => (r() - 0.5) / Math.sqrt(d));
    this.B = Float64Array.from({ length: 20 }, () => r() - 0.5); this.c = new Float64Array(10);
    this.st = [this.A, this.B, this.c].map(p => ({ m: new Float64Array(p.length), v: new Float64Array(p.length) }));
    this.t = 0; this.m = new Float64Array(d); this.s = 1; this.loss = NaN; this.trainAcc = NaN;
  }
  // the centring and the scale of the points, so that the step size suits every layer
  fit(X, n) {
    const d = this.d; this.m = mean(X, n, d);
    let v = 0; for (let i = 0; i < n; i++) for (let k = 0; k < d; k++) v += (X[i * d + k] - this.m[k]) ** 2;
    this.s = 1 / Math.sqrt(Math.max(v / n, 1e-12));
  }
  z(X, i, out) {
    const { d, A, m, s } = this; let a = 0, b = 0;
    for (let k = 0; k < d; k++) { const c = (X[i * d + k] - m[k]) * s; a += A[k] * c; b += A[d + k] * c; }
    out[0] = a; out[1] = b; return out;
  }
  // the fraction of the points that the classifier on z puts in their class
  accuracy(X, n, Y) {
    const { B, c } = this, z = [0, 0]; let ok = 0;
    for (let i = 0; i < n; i++) {
      this.z(X, i, z); let best = 0, mx = -Infinity;
      for (let q = 0; q < 10; q++) { const v = B[2 * q] * z[0] + B[2 * q + 1] * z[1] + c[q]; if (v > mx) { mx = v; best = q; } }
      if (best === Y[i]) ok++;
    }
    return ok / n;
  }
  coords(X, n) { const Y = new Float64Array(2 * n), z = [0, 0]; for (let i = 0; i < n; i++) { this.z(X, i, z); Y[2 * i] = z[0]; Y[2 * i + 1] = z[1]; } return Y; }
  steps(X, n, Y, k, lr = 0.02) {
    const { d, A, B, c, m, s } = this;
    for (let t = 0; t < k; t++) {
      const gA = new Float64Array(2 * d), gB = new Float64Array(20), gc = new Float64Array(10), z = [0, 0], p = new Float64Array(10);
      let L = 0, ok = 0;
      for (let i = 0; i < n; i++) {
        this.z(X, i, z);
        let mx = -Infinity, best = 0;
        for (let q = 0; q < 10; q++) { p[q] = B[2 * q] * z[0] + B[2 * q + 1] * z[1] + c[q]; if (p[q] > mx) { mx = p[q]; best = q; } }
        let S = 0; for (let q = 0; q < 10; q++) S += (p[q] = Math.exp(p[q] - mx));
        for (let q = 0; q < 10; q++) p[q] /= S;
        L -= Math.log(Math.max(p[Y[i]], 1e-300)); if (best === Y[i]) ok++;
        p[Y[i]] -= 1;
        let d0 = 0, d1 = 0;
        for (let q = 0; q < 10; q++) { gB[2 * q] += p[q] * z[0]; gB[2 * q + 1] += p[q] * z[1]; gc[q] += p[q]; d0 += p[q] * B[2 * q]; d1 += p[q] * B[2 * q + 1]; }
        for (let k2 = 0; k2 < d; k2++) { const cc = (X[i * d + k2] - m[k2]) * s; gA[k2] += d0 * cc; gA[d + k2] += d1 * cc; }
      }
      this.loss = L / n; this.trainAcc = ok / n; this.t++;
      [[A, gA], [B, gB], [c, gc]].forEach(([P, g], q) => {
        const { m: M, v: V } = this.st[q], c1 = 1 - 0.9 ** this.t, c2 = 1 - 0.999 ** this.t;
        for (let i = 0; i < P.length; i++) {
          const gi = g[i] / n; M[i] = 0.9 * M[i] + 0.1 * gi; V[i] = 0.999 * V[i] + 0.001 * gi * gi;
          P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8);
        }
      });
    }
  }
}

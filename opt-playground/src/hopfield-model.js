// The networks of the Hopfield scene, on states of N = 12 x 12 pixels with
// values +1 (ink) and -1 (ground): the classical network of Hopfield (1982),
// with the Hebbian rule or the projection rule, updated one neuron at a time;
// the dense (modern) network of Krotov and Hopfield (2016) and Ramsauer et al.
// (2020), whose update is one step of softmax attention; the measures of
// recall used by the scene and by tests/hopfield.html.

import { rng } from './nn.js';
export { rng };

export const SIDE = 12, N = SIDE * SIDE;

// a 5 x 7 font, one string of 5 bits per row, drawn on the 12 x 12 grid with
// every column doubled (columns 1 to 10) and the rows stretched to 12
const FONT = {
  A: '01110 10001 10001 10001 11111 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11100 10010 10001 10001 10001 10010 11100',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
};
export const KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];

export function glyph(k) {
  const rows = FONT[k].split(' '), g = new Float64Array(N).fill(-1);
  for (let r = 0; r < SIDE; r++) {
    const fr = rows[Math.floor(r * 7 / SIDE)];
    for (let j = 0; j < 5; j++) if (fr[j] === '1') g[r * SIDE + 1 + 2 * j] = g[r * SIDE + 2 + 2 * j] = 1;
  }
  return g;
}

export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// random patterns of +1 and -1, and a copy of x with round(frac * N) pixels flipped
export function randomPattern(r) { const x = new Float64Array(N); for (let i = 0; i < N; i++) x[i] = r() < 0.5 ? -1 : 1; return x; }
export function corrupt(x, frac, r) {
  const y = Float64Array.from(x), idx = Array.from({ length: N }, (_, i) => i), k = Math.round(frac * N);
  for (let j = 0; j < k; j++) { const m = j + Math.floor(r() * (N - j)); [idx[j], idx[m]] = [idx[m], idx[j]]; y[idx[j]] = -y[idx[j]]; }
  return y;
}

// W = (1/N) sum_mu xi xi^T with zero diagonal
export function hebbian(X) {
  const W = new Float64Array(N * N);
  for (const x of X) for (let i = 0; i < N; i++) { const xi = x[i] / N; for (let j = 0; j < N; j++) W[i * N + j] += xi * x[j]; }
  for (let i = 0; i < N; i++) W[i * N + i] = 0;
  return W;
}

// W = X (X^T X)^{-1} X^T with zero diagonal (Personnaz, Guyon and Dreyfus
// 1985): every linearly independent pattern is a fixed point
export function projection(X) {
  const p = X.length, G = new Float64Array(p * p);
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) G[a * p + b] = dot(X[a], X[b]) + (a === b ? 1e-9 : 0);
  const Gi = invert(G, p), W = new Float64Array(N * N), Y = X.map(() => new Float64Array(N));
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { const g = Gi[a * p + b]; if (g) for (let j = 0; j < N; j++) Y[a][j] += g * X[b][j]; }
  for (let a = 0; a < p; a++) for (let i = 0; i < N; i++) { const xi = X[a][i]; for (let j = 0; j < N; j++) W[i * N + j] += xi * Y[a][j]; }
  for (let i = 0; i < N; i++) W[i * N + i] = 0;
  return W;
}
function invert(A, n) {
  const M = Float64Array.from(A), I = new Float64Array(n * n);
  for (let i = 0; i < n; i++) I[i * n + i] = 1;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[piv * n + c])) piv = r;
    if (piv !== c) for (let k = 0; k < n; k++) { [M[c * n + k], M[piv * n + k]] = [M[piv * n + k], M[c * n + k]]; [I[c * n + k], I[piv * n + k]] = [I[piv * n + k], I[c * n + k]]; }
    const d = M[c * n + c] || 1e-12;
    for (let k = 0; k < n; k++) { M[c * n + k] /= d; I[c * n + k] /= d; }
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r * n + c];
      if (f) for (let k = 0; k < n; k++) { M[r * n + k] -= f * M[c * n + k]; I[r * n + k] -= f * I[c * n + k]; }
    }
  }
  return I;
}

export function field(W, s, i) { let h = 0; const o = i * N; for (let j = 0; j < N; j++) h += W[o + j] * s[j]; return h; }
// E(s) = -1/2 s^T W s
export function energy(W, s) { let e = 0; for (let i = 0; i < N; i++) e += s[i] * field(W, s, i); return -0.5 * e; }

// one asynchronous update of neuron i: s_i = sign(h_i), unchanged when h_i = 0;
// the energy changes by -(s_i' - s_i) h_i, never positive
export function update(W, s, i) {
  const h = field(W, s, i), old = s[i], v = h > 0 ? 1 : h < 0 ? -1 : old;
  s[i] = v;
  return { i, h, old, v, flipped: v !== old, dE: -(v - old) * h };
}
export function permutation(r) {
  const p = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}
// updates in random order, sweep after sweep, until a whole sweep flips nothing
export function settle(W, s0, r, maxSweeps = 40) {
  const s = Float64Array.from(s0);
  let updates = 0;
  for (let k = 0; k < maxSweeps; k++) {
    let flips = 0;
    for (const i of permutation(r)) { updates++; if (update(W, s, i).flipped) flips++; }
    if (!flips) break;
  }
  return { s, updates };
}

// the overlaps m_mu = xi_mu . s / N
export const overlaps = (X, s) => X.map(x => dot(x, s) / N);

export function softmax(z) {
  const m = Math.max(...z), e = z.map(v => Math.exp(v - m)), S = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / S);
}
// the dense network: xi_new = X softmax(beta X^T xi), X with the patterns as columns
export function denseUpdate(X, xi, beta) {
  const p = softmax(X.map(x => beta * dot(x, xi))), y = new Float64Array(N);
  X.forEach((x, m) => { const w = p[m]; if (w > 1e-300) for (let j = 0; j < N; j++) y[j] += w * x[j]; });
  return { xi: y, p };
}
// E(xi) = -1/beta log sum exp(beta X^T xi) + 1/2 xi^T xi + 1/beta log p + 1/2 M^2
export function denseEnergy(X, xi, beta) {
  const z = X.map(x => beta * dot(x, xi)), m = Math.max(...z);
  const lse = m + Math.log(z.reduce((a, v) => a + Math.exp(v - m), 0));
  const M2 = Math.max(...X.map(x => dot(x, x)));
  return -lse / beta + 0.5 * dot(xi, xi) + Math.log(X.length) / beta + 0.5 * M2;
}

// recall of the stored patterns X (indices `tests`): from a cue with a fraction
// `noise` of its pixels flipped, and from the pattern itself; recalled when
// the final state (its signs, for the dense network after one update) has
// overlap at least 0.95 with the pattern of the cue
export function recallClassical(W, X, tests, noise, r) {
  let cue = 0, self = 0, mFail = 0, nFail = 0;
  for (const k of tests) {
    const a = settle(W, corrupt(X[k], noise, r), r).s, m = dot(a, X[k]) / N;
    if (m >= 0.95) cue++; else { mFail += Math.abs(m); nFail++; }
    if (dot(settle(W, X[k], r).s, X[k]) / N >= 0.95) self++;
  }
  return { cue: cue / tests.length, self: self / tests.length, failOverlap: nFail ? mFail / nFail : null };
}
export function recallDense(X, tests, noise, beta, r) {
  let ok = 0;
  for (const k of tests) {
    const y = denseUpdate(X, corrupt(X[k], noise, r), beta).xi;
    let m = 0; for (let j = 0; j < N; j++) m += (y[j] >= 0 ? 1 : -1) * X[k][j];
    if (m / N >= 0.95) ok++;
  }
  return ok / tests.length;
}

// the plane through the mean c of the stored patterns spanned by their first
// two principal directions u1, u2 (power iteration on the Gram matrix of the
// centred patterns); a direction they do not provide is a random one
export function plane(X, r) {
  const p = X.length, c = new Float64Array(N);
  for (const x of X) for (let j = 0; j < N; j++) c[j] += x[j] / p;
  const Y = X.map(x => x.map((v, j) => v - c[j]));
  const G = Y.map(a => Y.map(b => dot(a, b)));
  const us = [];
  for (let k = 0; k < 2; k++) {
    let v = Array.from({ length: p }, () => r() - 0.5), lam = 0;
    for (let it = 0; it < 200; it++) {
      let w = v.map((_, a) => G[a].reduce((s, g, b) => s + g * v[b], 0));
      // deflation: remove the directions already found
      for (const u of us) { const d = u.coef.reduce((s, x, a) => s + x * w[a], 0); w = w.map((x, a) => x - d * u.coef[a]); }
      lam = Math.hypot(...w); if (lam < 1e-9) break;
      v = w.map(x => x / lam);
    }
    let u = new Float64Array(N);
    if (lam > 1e-6) { v.forEach((x, a) => { for (let j = 0; j < N; j++) u[j] += x * Y[a][j]; }); us.push({ coef: v }); }
    else { for (let j = 0; j < N; j++) u[j] = r() - 0.5; us.push({ coef: v.map(() => 0) }); }
    for (const q of us.slice(0, -1).map(o => o.u)) { const d = dot(u, q); for (let j = 0; j < N; j++) u[j] -= d * q[j]; }
    const n = Math.hypot(...u); u = u.map(x => x / n);
    us[us.length - 1].u = u;
  }
  const [u1, u2] = us.map(o => o.u);
  const coords = s => { let a = 0, b = 0; for (let j = 0; j < N; j++) { const d = s[j] - c[j]; a += d * u1[j]; b += d * u2[j]; } return [a, b]; };
  const point = (a, b) => { const x = new Float64Array(N); for (let j = 0; j < N; j++) x[j] = c[j] + a * u1[j] + b * u2[j]; return x; };
  return { c, u1, u2, coords, point };
}

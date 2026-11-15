// Scene N: the digits of src/convdata.js normalized as those of MNIST are, so
// that the code of two numbers is not spent on where the digit sits and how
// large it is: the inked box is scaled to a side of 16 pixels (keeping its
// aspect) and the centre of mass moved to the centre of the grid.

import { makeSet } from './convdata.js';
import { N } from './convnet.js';

const SIDE = 16;

// bilinear sample of x at the real position (r, c), zero outside the grid
function at(x, r, c) {
  const r0 = Math.floor(r), c0 = Math.floor(c), fr = r - r0, fc = c - c0;
  const v = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? 0 : x[i * N + j]);
  return (1 - fr) * ((1 - fc) * v(r0, c0) + fc * v(r0, c0 + 1)) + fr * ((1 - fc) * v(r0 + 1, c0) + fc * v(r0 + 1, c0 + 1));
}

export function normalize(x) {
  let r0 = N, r1 = -1, c0 = N, c1 = -1;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (x[i * N + j] > 0.1) { r0 = Math.min(r0, i); r1 = Math.max(r1, i); c0 = Math.min(c0, j); c1 = Math.max(c1, j); }
  if (r1 < 0) return Float64Array.from(x);
  const s = SIDE / Math.max(r1 - r0 + 1, c1 - c0 + 1);
  // the scaled image, sampled at the centre of each target pixel, around the box centre
  const cr = (r0 + r1 + 1) / 2, cc = (c0 + c1 + 1) / 2, y = new Float64Array(N * N);
  let m = 0, mr = 0, mc = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const v = at(x, cr + (i + 0.5 - N / 2) / s - 0.5, cc + (j + 0.5 - N / 2) / s - 0.5);
    y[i * N + j] = v; m += v; mr += v * (i + 0.5); mc += v * (j + 0.5);
  }
  // then shifted so that its centre of mass falls at the centre
  const dr = mr / m - N / 2, dc = mc / m - N / 2, z = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) z[i * N + j] = Math.min(1, Math.max(0, at(y, i + dr, j + dc)));
  return z;
}

export function makeNormSet(n, seed) {
  const s = makeSet(n, seed);
  return { X: s.X.map(normalize), Y: s.Y };
}

// The point clouds of the scene P, all inside about [-2.2, 2.2]^2, so that the
// data and the standard normal of t = T fit the same plane.

import { mulberry, gauss } from './diffusion-model.js';

export const DATASETS = {
  spirals: 'Two spirals', ring: 'Ring', gaussians: 'Eight gaussians', word: 'The word DDPM', checker: 'Checkerboard',
};

// the letters as polylines in a box of width W and height H, the origin at the
// bottom left; an arc is a list of points on an ellipse
const W = 0.9, H = 1.6;
const arc = (cx, cy, rx, ry, a0, a1, k = 16) => Array.from({ length: k + 1 }, (_, i) => {
  const a = a0 + (a1 - a0) * i / k; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
const LETTERS = {
  D: [[[0, 0], [0, H], [0.4 * W, H], ...arc(0.4 * W, H / 2, 0.6 * W, H / 2, Math.PI / 2, -Math.PI / 2), [0, 0]]],
  P: [[[0, 0], [0, H], [0.5 * W, H], ...arc(0.5 * W, 0.75 * H, 0.5 * W, 0.25 * H, Math.PI / 2, -Math.PI / 2), [0, 0.5 * H]]],
  M: [[[0, 0], [0, H], [0.5 * W, 0.4 * H], [W, H], [W, 0]]],
};

function wordSegments(word, gap = 0.2) {
  const segs = [], width = word.length * W + (word.length - 1) * gap;
  [...word].forEach((ch, k) => {
    const x0 = -width / 2 + k * (W + gap);
    for (const line of LETTERS[ch])
      for (let i = 0; i + 1 < line.length; i++)
        segs.push([x0 + line[i][0], line[i][1] - H / 2, x0 + line[i + 1][0], line[i + 1][1] - H / 2]);
  });
  return segs;
}

// n points of the cloud `kind`, as x0, y0, x1, y1, ...
export function makeData(kind, n, seed = 1) {
  const r = mulberry(seed * 9973 + kind.length), X = new Float64Array(2 * n);
  const put = (i, x, y) => { X[2 * i] = x; X[2 * i + 1] = y; };
  if (kind === 'spirals') {
    for (let i = 0; i < n; i++) {
      const u = Math.sqrt(r()), th = 2.5 * Math.PI * u + (i % 2) * Math.PI, rad = 0.15 + 2 * u;
      put(i, rad * Math.cos(th) + 0.06 * gauss(r), rad * Math.sin(th) + 0.06 * gauss(r));
    }
  } else if (kind === 'ring') {
    for (let i = 0; i < n; i++) {
      const th = 2 * Math.PI * r(), rad = 1.6 + 0.07 * gauss(r);
      put(i, rad * Math.cos(th), rad * Math.sin(th));
    }
  } else if (kind === 'gaussians') {
    for (let i = 0; i < n; i++) {
      const th = 2 * Math.PI * (i % 8) / 8;
      put(i, 1.7 * Math.cos(th) + 0.13 * gauss(r), 1.7 * Math.sin(th) + 0.13 * gauss(r));
    }
  } else if (kind === 'checker') {
    // 8 of the 16 squares of side 1 in [-2, 2]^2, alternating
    for (let i = 0; i < n; i++) {
      const c = Math.floor(r() * 8), row = Math.floor(c / 2), col = 2 * (c % 2) + (row % 2);
      put(i, -2 + col + r(), -2 + row + r());
    }
  } else {
    const segs = wordSegments('DDPM'), len = segs.map(([a, b, c, d]) => Math.hypot(c - a, d - b)), L = len.reduce((s, v) => s + v, 0);
    for (let i = 0; i < n; i++) {
      let u = r() * L, k = 0;
      while (k < segs.length - 1 && u > len[k]) u -= len[k++];
      const [a, b, c, d] = segs[k], f = Math.min(1, u / len[k]);
      put(i, a + f * (c - a) + 0.035 * gauss(r), b + f * (d - b) + 0.035 * gauss(r));
    }
  }
  return X;
}

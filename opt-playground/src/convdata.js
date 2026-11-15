// Synthetic digits for scene I: the digits 0-9 written with fillText (and a
// stroke of random width) in a few font families, at random size, rotation
// and offset, onto a 20x20 grid of intensities in [0, 1]. No external data.

import { rng } from './nn.js';
import { N } from './convnet.js';

const FAMILIES = ['sans-serif', 'serif', 'monospace'];
const STYLES = ['', 'bold ', 'italic ', 'italic bold '];
let ctx = null;

function canvas() {
  if (ctx) return ctx;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  return (ctx = cv.getContext('2d', { willReadFrequently: true }));
}

export function digit(d, r) {
  const c = canvas();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#000'; c.fillRect(0, 0, N, N);
  const size = 15 + 8 * r(), rot = (r() - 0.5) * 0.5, dx = (r() - 0.5) * 5, dy = (r() - 0.5) * 4;
  c.font = `${STYLES[Math.floor(r() * STYLES.length)]}${size.toFixed(1)}px ${FAMILIES[Math.floor(r() * FAMILIES.length)]}`;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const m = c.measureText(String(d)), mid = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  c.translate(N / 2 + dx, N / 2 + dy); c.rotate(rot);
  c.fillStyle = c.strokeStyle = '#fff';
  c.fillText(String(d), 0, mid);
  const w = 1.6 * r();
  if (w > 0.3) { c.lineWidth = w; c.lineJoin = 'round'; c.strokeText(String(d), 0, mid); }
  const px = c.getImageData(0, 0, N, N).data, x = new Float64Array(N * N);
  for (let k = 0; k < N * N; k++) x[k] = px[4 * k] / 255;
  return x;
}

// n digits with balanced labels, reproducible from the seed
export function makeSet(n, seed) {
  const r = rng(seed * 2654435761 + 17), X = [], Y = new Int8Array(n);
  for (let i = 0; i < n; i++) { Y[i] = i % 10; X.push(digit(Y[i], r)); }
  return { X, Y };
}

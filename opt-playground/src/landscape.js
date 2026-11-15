// The loss landscape of the network scene, after Li, Xu, Taylor, Studer and
// Goldstein, "Visualizing the Loss Landscape of Neural Nets" (NeurIPS 2018):
// the loss on the plane v0 + a d1 + b d2 through the current weights v0, with d1
// and d2 Gaussian and filter-normalized, i.e., the block of every neuron (its
// incoming weights) rescaled to the norm of the same block of v0, and the
// directions of the biases set to zero, as in their code. Past weights are
// projected on the plane by least squares, since d1 and d2 are not orthogonal.
// As in their section 7, the plane can instead be that of the two principal
// directions of the path, where the path shows.

import { rng } from './nn.js';

// the parameters in a fixed order: every neuron, then its incoming links
export function params(net) {
  const out = [];
  for (let l = 1; l < net.length; l++) for (const n of net[l]) { out.push(n); for (const k of n.inputs) out.push(k); }
  return out;
}
export const getV = net => params(net).map(o => ('w' in o ? o.w : o.bias));
export const setV = (net, v) => params(net).forEach((o, i) => { if ('w' in o) o.w = v[i]; else o.bias = v[i]; });

// the blocks of the neurons, as [first index, length]: the bias, then the weights
function blocks(net) {
  const out = []; let i = 0;
  for (let l = 1; l < net.length; l++) for (const n of net[l]) { out.push([i, 1 + n.inputs.length]); i += 1 + n.inputs.length; }
  return out;
}

export function direction(net, r) {
  const v0 = getV(net), d = new Array(v0.length).fill(0);
  const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
  for (const [s, len] of blocks(net)) {
    let nd = 0, nw = 0;
    for (let k = s + 1; k < s + len; k++) { d[k] = gauss(); nd += d[k] ** 2; nw += v0[k] ** 2; }
    const f = Math.sqrt(nw / (nd || 1));
    for (let k = s + 1; k < s + len; k++) d[k] *= f;
  }
  return d;
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
// the coordinates (a, b) of the point of the plane nearest to v
export function project(v, v0, d1, d2) {
  const e = v.map((x, i) => x - v0[i]), g11 = dot(d1, d1), g12 = dot(d1, d2), g22 = dot(d2, d2);
  const r1 = dot(e, d1), r2 = dot(e, d2), det = g11 * g22 - g12 * g12 || 1;
  return [(g22 * r1 - g12 * r2) / det, (g11 * r2 - g12 * r1) / det];
}

// the loss on a G x G grid of [-R, R]^2: vals[j * G + i] at a = -R + 2R i/(G-1),
// b = -R + 2R j/(G-1); the weights of the network are put back at the end
export function surface(net, lossOf, d1, d2, R, G) {
  const v0 = getV(net), vals = new Float64Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const a = -R + 2 * R * i / (G - 1), b = -R + 2 * R * j / (G - 1);
    setV(net, v0.map((x, k) => x + a * d1[k] + b * d2[k]));
    vals[j * G + i] = lossOf(net);
  }
  setV(net, v0);
  return vals;
}

// the value of the grid at (a, b), interpolated
export function at(land, a, b) {
  const { vals, G, R } = land, u = (a + R) / (2 * R) * (G - 1), w = (b + R) / (2 * R) * (G - 1);
  const i = Math.max(0, Math.min(G - 2, Math.floor(u))), j = Math.max(0, Math.min(G - 2, Math.floor(w))), s = u - i, t = w - j;
  return (1 - s) * (1 - t) * vals[j * G + i] + s * (1 - t) * vals[j * G + i + 1] + (1 - s) * t * vals[(j + 1) * G + i] + s * t * vals[(j + 1) * G + i + 1];
}

// the two principal directions of the path around v0 (unit vectors), as Li et
// al. do for trajectories, since a random plane catches little of a path in
// many dimensions: power iteration on X'X, X the past weights minus v0
export function pcaDirections(snapshots, v0) {
  const X = snapshots.map(v => v.map((x, i) => x - v0[i])), n = v0.length, r = rng(7), out = [];
  for (let c = 0; c < 2; c++) {
    let d = Array.from({ length: n }, () => r() - 0.5);
    for (let it = 0; it < 200; it++) {
      for (const p of out) { const k = dot(d, p); d = d.map((x, i) => x - k * p[i]); }
      const y = new Array(n).fill(0);
      for (const row of X) { const k = dot(row, d); row.forEach((x, i) => { y[i] += k * x; }); }
      const nn = Math.hypot(...y);
      if (nn < 1e-14) break;
      d = y.map(x => x / nn);
    }
    for (const p of out) { const k = dot(d, p); d = d.map((x, i) => x - k * p[i]); }
    const nn = Math.hypot(...d) || 1; out.push(d.map(x => x / nn));
  }
  return out;
}

// everything the views need: the directions (filter-normalized random ones,
// or the principal ones of the path), the range, the grid
export function landscape(net, lossOf, snapshots, mode = 'random', seed = 99, G = 41) {
  const r = rng(seed), v0 = getV(net);
  if (snapshots.length < 3) mode = 'random';
  const [d1, d2] = mode === 'pca' ? pcaDirections(snapshots, v0) : [direction(net, r), direction(net, r)];
  const path = snapshots.map(v => project(v, v0, d1, d2)), far = Math.max(0, ...path.flat().map(Math.abs));
  const R = mode === 'pca' ? Math.max(0.05, 1.15 * far) : Math.min(3, Math.max(1, 1.1 * far));
  const vals = surface(net, lossOf, d1, d2, R, G);
  let lo = Infinity, hi = -Infinity; for (const v of vals) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { v0, d1, d2, R, G, vals, lo, hi, mode };
}

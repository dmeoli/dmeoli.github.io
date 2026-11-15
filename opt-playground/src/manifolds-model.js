// The model of scene G, without the page: the data sets, the training of a
// network 2 -> (w) x L -> 1 with w = 2 or 3, and the deformation that carries a
// point of the input plane into the hidden layers. With w = 3 the plane is
// first put in space at z = 0, so that the linear map of the first layer, a
// 3 x 2 matrix, reads as a map of space that sends the plane onto a plane.

import { build, forward, backward, update, rng } from './nn.js';

// the data, in [-1, 1]^2, labels +1 and -1
export function makeData(kind, r) {
  const pts = [], n = 240, g = () => (r() - 0.5) * 0.08;
  for (let i = 0; i < n; i++) {
    const pos = i % 2 === 0;
    if (kind === 'curves') {             // two interleaved curves
      const x = 2 * r() - 1;
      pts.push({ x, y: 0.45 * Math.sin(3 * x) + (pos ? 0.22 : -0.22) + g(), label: pos ? 1 : -1 });
    } else if (kind === 'ring') {        // a disc inside a ring
      const a = 2 * Math.PI * r(), rad = pos ? 0.35 * Math.sqrt(r()) : 0.65 + 0.25 * r();
      pts.push({ x: rad * Math.cos(a), y: rad * Math.sin(a), label: pos ? 1 : -1 });
    } else if (kind === 'xor') {
      const x = 2 * r() - 1, y = 2 * r() - 1;
      pts.push({ x: x + Math.sign(x) * 0.05, y: y + Math.sign(y) * 0.05, label: x * y > 0 ? 1 : -1 });
    } else {                             // two spirals
      const t = 0.25 + 1.6 * Math.PI * r(), d = pos ? 0 : Math.PI, rad = t / (1.85 * Math.PI);
      pts.push({ x: rad * Math.cos(t + d) + g(), y: rad * Math.sin(t + d) + g(), label: pos ? 1 : -1 });
    }
  }
  return pts;
}

export const makeNet = (width, layers, act, seed) => build([2, ...Array(layers).fill(width), 1], act, 'tanh', seed * 17 + 1);

export function trainEpoch(net, pts, epoch) {
  const r = rng(epoch + 1), order = pts.map((_, i) => i).sort(() => r() - 0.5);
  for (let b = 0; b < order.length; b += 10) {
    const batch = order.slice(b, b + 10);
    for (const i of batch) { forward(net, [pts[i].x, pts[i].y]); backward(net, pts[i].label); }
    update(net, 'adam', 0.02, 'L2', 0.0005, batch.length);
  }
}

export const accuracy = (net, pts) => pts.filter(p => Math.sign(forward(net, [p.x, p.y])) === p.label).length / pts.length;

// the weights of hidden layer k: W is w x 2 for the first layer, w x w after
export function layerParams(net, k) {
  const L = net[k + 1];
  return { W: L.map(n => n.inputs.map(l => l.w)), b: L.map(n => n.bias) };
}
export const actf = { tanh: Math.tanh, relu: x => Math.max(0, x) };

// the coordinates of a point after the deformation T: layer k = floor(T / 3),
// phase floor(T) mod 3 (W, then b, then the activation), and the fraction s
// inside the phase; the result has as many coordinates as the layers are wide
export function deform(net, act, p, T) {
  const L = net.length - 2, w = net[1].length;
  let z = w === 3 ? [p[0], p[1], 0] : [p[0], p[1]];
  for (let k = 0; k < L; k++) {
    const { W, b } = layerParams(net, k), loc = Math.min(3, T - 3 * k);
    const Wz = W.map(row => row.reduce((s, x, j) => s + x * z[j], 0));
    const s1 = Math.min(1, Math.max(0, loc)), s2 = Math.min(1, Math.max(0, loc - 1)), s3 = Math.min(1, Math.max(0, loc - 2));
    const u = z.map((x, i) => (1 - s1) * x + s1 * Wz[i] + s2 * b[i]);
    z = u.map(x => (1 - s3) * x + s3 * actf[act](x));
    if (loc < 3) break;
  }
  return z;
}

export function det(W) {
  if (W.length === 2) return W[0][0] * W[1][1] - W[0][1] * W[1][0];
  return W[0][0] * (W[1][1] * W[2][2] - W[1][2] * W[2][1]) - W[0][1] * (W[1][0] * W[2][2] - W[1][2] * W[2][0]) + W[0][2] * (W[1][0] * W[2][1] - W[1][1] * W[2][0]);
}

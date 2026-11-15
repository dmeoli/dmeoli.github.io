// A training run of scene O: the data set of the TensorFlow Playground, split
// in halves for training and test, the deep network and its optimizer, the
// epochs on shuffled minibatches, and the measures drawn by the page.

import { dataset, rng } from './nn.js';
import { makeNet, forward, backward, lossOf, setStats, makeOpt, weightGrads } from './depth-net.js';

export const DATA = { circle: 'Circle', xor: 'Exclusive or', gauss: 'Gaussians', spiral: 'Spiral' };
export const SCALE = 3;   // the coordinates in [-6, 6] are divided by it
export const BATCH = 20;

function pack(pts) {
  const B = pts.length, X = new Float64Array(2 * B), y = new Float64Array(B);
  pts.forEach((p, i) => { X[2 * i] = p.x / SCALE; X[2 * i + 1] = p.y / SCALE; y[i] = p.label > 0 ? 1 : -1; });
  return { X, y, B, pts };
}

// cfg: { data, depth, width, act, init, norm, res, opt, lr, seed }
export function createRun(cfg) {
  const rd = rng(1000 + cfg.seed), pts = dataset(cfg.data, 400, 0, rd);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  const train = pack(pts.slice(0, 200)), test = pack(pts.slice(200));
  const net = makeNet(cfg, rng(cfg.seed * 7919 + 3)), opt = makeOpt(net, cfg.opt, cfg.lr), rs = rng(cfg.seed + 77);
  const run = { cfg, net, opt, train, test, epoch: 0, hist: [], meas: null };

  run.trainEpoch = () => {
    const idx = [...Array(train.B).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rs() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let s = 0; s < train.B; s += BATCH) {
      const b = idx.slice(s, s + BATCH), B = b.length, X = new Float64Array(2 * B), y = new Float64Array(B);
      b.forEach((k, i) => { X[2 * i] = train.X[2 * k]; X[2 * i + 1] = train.X[2 * k + 1]; y[i] = train.y[k]; });
      const F = forward(net, X, B, 'train');
      opt.step(backward(net, F, y));
    }
    run.epoch++;
  };
  // the activations and the weight gradients of every layer on the whole
  // training set, the losses and the accuracies
  run.measure = () => {
    setStats(net, train.X, train.B);
    const F = forward(net, train.X, train.B, 'train'), G = backward(net, F, train.y);
    const T = forward(net, test.X, test.B, 'eval');
    const acc = (o, y) => o.reduce((s, v, i) => s + (v * y[i] > 0), 0) / o.length;
    const m = { loss: lossOf(F.o, train.y), testLoss: lossOf(T.o, test.y), acc: acc(F.o, train.y), testAcc: acc(T.o, test.y),
      acts: F.C.map(c => c.h), grads: weightGrads(net, G) };
    m.gnorm = m.grads.map(g => Math.hypot(...g));
    run.meas = m;
    run.hist.push({ epoch: run.epoch, loss: m.loss, testLoss: m.testLoss, acc: m.acc, testAcc: m.testAcc });
    return m;
  };
  // the output and the first unit of every layer on a G x G grid of the plane
  run.grid = G => {
    const B = G * G, X = new Float64Array(2 * B), n = net.n;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const q = j * G + i;
      X[2 * q] = (-6 + 12 * (i + 0.5) / G) / SCALE; X[2 * q + 1] = (6 - 12 * (j + 0.5) / G) / SCALE;
    }
    const F = forward(net, X, B, 'eval');
    return { o: F.o, units: F.C.map(c => { const u = new Float64Array(B); for (let q = 0; q < B; q++) u[q] = c.h[q * n]; return u; }) };
  };
  run.measure();
  return run;
}

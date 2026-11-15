// A run of the LSTM scene: an LSTM, a GRU and a plain RNN of the same size, from the
// same seed, trained with Adam on the same minibatches of fresh sequences, and
// measured on a fixed set of test sequences. Shared by the page and its test.

import { makeNet, forward, backward, adam, rng, argmax } from './lstm-net.js';
import { TASKS, sample } from './lstm-tasks.js';

export const BATCH = 16, PER_EPOCH = 10, NTEST = 200, NGRAD = 32;

export function createRun({ task, T, H, lr, seed }) {
  const K = TASKS[task].K, w = seed * 7 + 1, tr = rng(seed * 977 + 3), br = rng(seed * 131 + 5);
  const run = {
    task, T, H, lr, K, epoch: 0,
    nets: { lstm: makeNet('lstm', H, 2, K, w), gru: makeNet('gru', H, 2, K, w), rnn: makeNet('rnn', H, 2, K, w) },
    test: Array.from({ length: NTEST }, () => sample(task, T, tr)),
    hist: { lstm: [], gru: [], rnn: [] }, grads: null,
  };
  // one epoch: PER_EPOCH minibatches of BATCH fresh sequences
  run.trainEpoch = () => {
    for (let b = 0; b < PER_EPOCH; b++) {
      const batch = Array.from({ length: BATCH }, () => sample(task, T, br));
      for (const n of Object.values(run.nets)) {
        for (const s of batch) backward(n, s.xs, s.outs, forward(n, s.xs, s.outs));
        adam(n, run.lr, batch.length);
      }
    }
    run.epoch++;
  };
  // the loss and the accuracy on the test outputs, and the mean of |dL_T/dh_t|
  // (loss at the last output only) over the first NGRAD test sequences
  run.measure = () => {
    run.grads = {};
    for (const [k, n] of Object.entries(run.nets)) {
      let loss = 0, ok = 0, tot = 0;
      const g = new Float64Array(T);
      run.test.forEach((s, q) => {
        const F = forward(n, s.xs, s.outs);
        loss += F.loss;
        s.outs.forEach((o, j) => { tot++; if (argmax(F.P[j]) === o.y) ok++; });
        if (q < NGRAD) { const nr = backward(n, s.xs, s.outs, F, true); for (let t = 0; t < T; t++) g[t] += nr[t] / NGRAD; }
      });
      n.g.fill(0);
      run.hist[k].push({ epoch: run.epoch, loss: loss / run.test.length, acc: ok / tot });
      run.grads[k] = g;
    }
  };
  // the accuracy of a constant answer, the most frequent class of the test outputs
  const c = {}; let tot = 0;
  for (const s of run.test) for (const o of s.outs) { c[o.y] = (c[o.y] || 0) + 1; tot++; }
  run.baseline = Math.max(...Object.values(c)) / tot;
  run.measure();
  return run;
}

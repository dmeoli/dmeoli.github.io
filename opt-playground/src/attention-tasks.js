// The toy tasks of scene K, generated in the browser. The digits are the
// tokens 0-9 and token 10 is the separator. Every example is one sequence
// read by the model from left to right; at the positions with a target the
// model must predict the next token (teacher forcing), and at generation the
// predictions are fed back one at a time.
//   reverse:  x_1 ... x_n | y_1 ... y_{n-1}   with y = x reversed
//   sort:     x_1 ... x_n | y_1 ... y_{n-1}   with y = x sorted
//   recall:   a_1 ... a_n | a_i               with target a_{i+1}, distinct a's
// (recall is the induction pattern "a b ... a -> b").

import { forward, backward, probs, zeroGrad, adam } from './attention-model.js';

export const SEP = 10, VOCAB = 11;
export const tasks = {
  reverse: { label: 'reverse', T: n => 2 * n },
  sort: { label: 'sort', T: n => 2 * n },
  recall: { label: 'recall (a b ... a → b)', T: n => n + 2 },
};

// the answer of a task for the prompt xs (for recall, xs ends with the query)
export function answer(task, xs) {
  if (task === 'reverse') return xs.slice().reverse();
  if (task === 'sort') return xs.slice().sort((a, b) => a - b);
  const q = xs.at(-1), i = xs.indexOf(q);
  return [i >= 0 && i < xs.length - 2 ? xs[i + 1] : -1];
}

// a random prompt: n digits, and for recall n distinct digits and a query
export function randomPrompt(task, n, r) {
  if (task !== 'recall') return Array.from({ length: n }, () => Math.floor(10 * r()));
  const a = [...Array(10).keys()];
  for (let i = 9; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const xs = a.slice(0, n);
  return [...xs, xs[Math.floor(r() * (n - 1))]];
}

// the sequence read by the model for a prompt and its answer, the targets
// (-1 where there is none) and the length of the prompt (input and
// separator), which a non-causal mask lets see itself in both directions
export function sequence(task, xs, ys) {
  if (task === 'recall') {
    const n = xs.length - 1, tokens = [...xs.slice(0, n), SEP, xs[n]], targets = tokens.map(() => -1);
    targets[n + 1] = ys[0];
    return { tokens, targets, prompt: n + 1 };
  }
  const n = xs.length, tokens = [...xs, SEP, ...ys.slice(0, n - 1)], targets = tokens.map(() => -1);
  for (let k = 0; k < n; k++) targets[n + k] = ys[k];
  return { tokens, targets, prompt: n + 1 };
}

export function example(task, n, r) {
  const xs = randomPrompt(task, n, r);
  return sequence(task, xs, answer(task, xs));
}

const argmax = p => p.reduce((b, v, i) => (v > p[b] ? i : b), 0);

// greedy generation: the predictions are fed back one by one; returns the
// final sequence, its cache, and the prediction at every query position
export function generate(M, task, xs, causal) {
  const ex = sequence(task, xs, answer(task, xs)), P = causal ? 0 : ex.prompt;
  const tokens = ex.tokens.slice(0, ex.prompt + (task === 'recall' ? 1 : 0)), preds = [];
  const qpos = ex.targets.map((t, i) => (t >= 0 ? i : -1)).filter(i => i >= 0);
  let C;
  for (const p of qpos) {
    C = forward(M, tokens.slice(0, p + 1), P);
    const pr = probs(M, C, p), y = argmax(pr);
    preds.push({ pos: p, token: y, p: pr[y], target: ex.targets[p] });
    if (p + 1 < ex.tokens.length && tokens.length === p + 1) tokens.push(y);
  }
  C = forward(M, tokens, P);
  return { tokens, C, preds, prompt: ex.prompt };
}

// teacher-forced token accuracy and mean loss on a list of examples
export function evaluate(M, exs, causal) {
  let ok = 0, tot = 0, loss = 0;
  for (const ex of exs) {
    const C = forward(M, ex.tokens, causal ? 0 : ex.prompt);
    ex.targets.forEach((t, i) => {
      if (t < 0) return;
      const p = probs(M, C, i);
      tot++; loss -= Math.log(p[t] + 1e-300); if (argmax(p) === t) ok++;
    });
  }
  return { acc: ok / tot, loss: loss / tot };
}

// one step of Adam on a fresh batch of examples; returns the mean loss
export function trainStep(M, task, n, causal, lr, r, batch = 32) {
  zeroGrad(M);
  let loss = 0;
  for (let b = 0; b < batch; b++) {
    const ex = example(task, n, r), norm = batch * ex.targets.filter(t => t >= 0).length;
    loss += backward(M, forward(M, ex.tokens, causal ? 0 : ex.prompt), ex.targets, norm);
  }
  adam(M, lr);
  return loss;
}

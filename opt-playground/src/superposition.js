// Scene H: superposition in a toy model, after Elhage et al., "Toy Models of
// Superposition" (Anthropic, 2022), https://transformer-circuits.pub/2022/toy_model/
// (the model rebuilt from its equations; no figure or code of the paper is used).
// n features x_i, each zero with probability S and uniform in [0, 1] otherwise,
// are squeezed into m = 2 dimensions h = W x and read back as
// x' = ReLU(W'W x + b), with the loss sum_i I_i (x_i - x'_i)^2 and importances
// I_i = r^i. Dense features get the m most important directions and the rest
// are dropped; sparse ones are packed in superposition, antipodal pairs first,
// then pentagons, because two rarely active features rarely interfere.

import { rng } from './nn.js';

const $ = id => document.getElementById(id);
const S = { n: 5, sparsity: 0, decay: 0.9, out: 'relu', seed: 1 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });
const m = 2;
let W, b, st, steps, r, timer = null;

function reset() {
  stop();
  r = rng(S.seed * 101 + 3);
  W = Array.from({ length: m }, () => Array.from({ length: S.n }, () => (r() - 0.5) * 0.4));
  b = Array(S.n).fill(0);
  st = { mW: W.map(row => row.map(() => 0)), vW: W.map(row => row.map(() => 0)), mb: b.map(() => 0), vb: b.map(() => 0), t: 0 };
  steps = 0; save(); draw();
}

// 1 - S is the probability that a feature is active; the slider is its log10
const density = () => 10 ** (-S.sparsity);
function trainSteps(k) {
  const n = S.n, I = Array.from({ length: n }, (_, i) => S.decay ** i), p = density(), B = 128, lr = 0.01;
  for (let it = 0; it < k; it++) {
    const gW = W.map(row => row.map(() => 0)), gb = Array(n).fill(0);
    for (let s = 0; s < B; s++) {
      const x = Array.from({ length: n }, () => (r() < p ? r() : 0));
      const h = [0, 1].map(c => W[c].reduce((t, w, j) => t + w * x[j], 0));
      for (let i = 0; i < n; i++) {
        const y = W[0][i] * h[0] + W[1][i] * h[1] + b[i], o = S.out === 'relu' ? Math.max(0, y) : y;
        const dy = 2 * I[i] * (o - x[i]) * (S.out === 'relu' && y <= 0 ? 0 : 1) / B;
        if (!dy) continue;
        gb[i] += dy;
        for (let c = 0; c < m; c++) {
          gW[c][i] += h[c] * dy;                              // through W' in the read-out
          for (let j = 0; j < n; j++) gW[c][j] += W[c][i] * dy * x[j];   // through W in h
        }
      }
    }
    // Adam
    st.t++;
    const c1 = 1 - 0.9 ** st.t, c2 = 1 - 0.999 ** st.t, upd = (g, mm, vv, i, j) => {
      mm[i][j] = 0.9 * mm[i][j] + 0.1 * g; vv[i][j] = 0.999 * vv[i][j] + 0.001 * g * g;
      return lr * (mm[i][j] / c1) / (Math.sqrt(vv[i][j] / c2) + 1e-8);
    };
    for (let c = 0; c < m; c++) for (let j = 0; j < n; j++) W[c][j] -= upd(gW[c][j], st.mW, st.vW, c, j);
    for (let i = 0; i < n; i++) b[i] -= upd(gb[i], [st.mb], [st.vb], 0, i);
    steps++;
  }
}

// ------------------------------------------------------------------ drawing
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, c, t) => `rgb(${a.map((v, i) => Math.round(v + t * (c[i] - v))).join(',')})`;
const col = j => { const n = S.n; return mix(hex(css('--lilac')), hex(css('--accent')), n > 1 ? 1 - j / (n - 1) : 1); };

function draw() {
  const n = S.n, norms = Array.from({ length: n }, (_, i) => Math.hypot(W[0][i], W[1][i]));
  const interf = Array.from({ length: n }, (_, i) => {
    if (norms[i] < 1e-9) return 0;
    let s = 0;
    for (let j = 0; j < n; j++) if (j !== i) s += ((W[0][i] * W[0][j] + W[1][i] * W[1][j]) / norms[i]) ** 2;
    return s;
  });
  // the columns of W as arrows in the plane of the hidden layer
  let cv = $('arrows'), ctx = cv.getContext('2d'), Wd = cv.width, R = Wd / 2 - 24;
  ctx.fillStyle = css('--ground'); ctx.fillRect(0, 0, Wd, Wd);
  const sc = R / Math.max(1.2, ...norms);
  ctx.strokeStyle = css('--rule'); ctx.beginPath(); ctx.arc(Wd / 2, Wd / 2, sc, 0, 2 * Math.PI); ctx.stroke();
  for (let i = n - 1; i >= 0; i--) {
    const x = Wd / 2 + sc * W[0][i], y = Wd / 2 - sc * W[1][i];
    ctx.strokeStyle = col(i); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(Wd / 2, Wd / 2); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = col(i); ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = css('--ink-soft'); ctx.font = '11px IBM Plex Mono, monospace';
    ctx.fillText(i + 1, x + 7 * Math.sign(W[0][i] || 1), y - 7 * Math.sign(W[1][i] || 1));
  }
  // W'W and b, in a diverging map: violet positive, gold negative
  cv = $('gram'); ctx = cv.getContext('2d'); const G = cv.width, cell = Math.min((G - 30) / n, cv.height / n);
  ctx.fillStyle = css('--ground'); ctx.fillRect(0, 0, G, cv.height);
  const A = hex(css('--accent')), Gd = hex(css('--gold')), Bg = hex(css('--ground'));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = W[0][i] * W[0][j] + W[1][i] * W[1][j];
      ctx.fillStyle = mix(Bg, v > 0 ? A : Gd, Math.min(1, Math.abs(v))); ctx.fillRect(j * cell, i * cell, cell - 1, cell - 1);
    }
    ctx.fillStyle = mix(Bg, b[i] > 0 ? A : Gd, Math.min(1, Math.abs(b[i]) * 2)); ctx.fillRect(n * cell + 8, i * cell, 22, cell - 1);
  }
  // the norm of every feature, coloured by how much it interferes with the others
  cv = $('bars'); ctx = cv.getContext('2d'); const Bw = cv.width, Bh = cv.height, bh = (Bh - 10) / n;
  ctx.fillStyle = css('--ground'); ctx.fillRect(0, 0, Bw, Bh);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = mix(hex(css('--accent')), hex(css('--gold')), Math.min(1, interf[i]));
    ctx.fillRect(28, 5 + i * bh, Math.min(1.3, norms[i]) / 1.3 * (Bw - 36), bh - 3);
    ctx.fillStyle = css('--ink-soft'); ctx.font = '11px IBM Plex Mono, monospace'; ctx.fillText(i + 1, 4, 5 + i * bh + bh / 2 + 3);
  }
  const rep = norms.filter(v => v > 0.5).length;
  $('rep').textContent = `${rep} of ${n} features represented in ${m} dimensions` + (rep > m ? ' (superposition)' : '');
  $('steps').textContent = steps;
  $('dens').textContent = density().toPrecision(2);
}

function save() { history.replaceState(null, '', '#' + new URLSearchParams(S)); }
function stop() { clearInterval(timer); timer = null; $('train').textContent = 'Train'; }

for (const k of ['n', 'sparsity', 'decay', 'out']) {
  $(k).value = S[k];
  $(k).oninput = e => { S[k] = k === 'out' ? e.target.value : +e.target.value; reset(); };
}
$('seed').onclick = () => { S.seed++; reset(); };
$('train').onclick = () => {
  if (timer) return stop();
  $('train').textContent = 'Pause';
  timer = setInterval(() => { trainSteps(20); draw(); if (steps >= 4000) stop(); }, 30);
};
reset();

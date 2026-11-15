// SVM, primal and dual side by side: the plane with the separating surface, the
// margins and the support vectors; the dual multipliers alpha_i in the box
// [0, C], with sum alpha_i y_i = 0. SMO (Platt) optimizes two multipliers at a
// time: every step lights the pair it moves, in the dual and in the primal.

import { rng } from './nn.js';

const $ = id => document.getElementById(id);
const S = { kernel: 'linear', C: 1, gamma: 0.5, data: 'blobs', seed: 3 };
let pts = [], alpha = [], b = 0, iter = 0, last = null, timer = null;

const kernels = {
  linear: (u, v) => u[0] * v[0] + u[1] * v[1],
  rbf: (u, v) => Math.exp(-S.gamma * ((u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2)),
  poly: (u, v) => (1 + u[0] * v[0] + u[1] * v[1]) ** 2,
};
const K = (i, j) => kernels[S.kernel](pts[i].x, pts[j].x);
const f = x => pts.reduce((s, p, i) => s + alpha[i] * p.y * kernels[S.kernel](p.x, x), b);

function makeData() {
  const r = rng(S.seed), g = () => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  pts = [];
  for (let i = 0; i < 40; i++) {
    const y = i < 20 ? 1 : -1;
    if (S.data === 'blobs') pts.push({ x: [y * 1.6 + 1.1 * g(), y * 1.2 + 1.1 * g()], y });
    else { const a = r() * 2 * Math.PI, rad = y > 0 ? 1.2 * r() : 2.6 + 1.2 * r(); pts.push({ x: [rad * Math.cos(a), rad * Math.sin(a)], y }); }
  }
  alpha = pts.map(() => 0); b = 0; iter = 0; last = null;
}

// one SMO step: the point that violates the KKT conditions most, paired with
// the partner that moves it furthest; a pair whose box is degenerate is skipped
function smoStep() {
  const E = pts.map((p, i) => f(p.x) - p.y), tol = 1e-3;
  const viol = pts.map((p, k) => {
    const r = E[k] * p.y;
    return (r < -tol && alpha[k] < S.C - 1e-12) || (r > tol && alpha[k] > 1e-12) ? Math.abs(r) : 0;
  });
  const order = viol.map((v, k) => [v, k]).filter(([v]) => v > 0).sort((a, c) => c[0] - a[0]).map(([, k]) => k);
  for (const i of order) {
    const partners = pts.map((_, k) => k).filter(k => k !== i).sort((a, c) => Math.abs(E[i] - E[c]) - Math.abs(E[i] - E[a]));
    for (const j of partners) {
      const yi = pts[i].y, yj = pts[j].y, ai = alpha[i], aj = alpha[j];
      const L = yi !== yj ? Math.max(0, aj - ai) : Math.max(0, ai + aj - S.C);
      const H = yi !== yj ? Math.min(S.C, S.C + aj - ai) : Math.min(S.C, ai + aj);
      const eta = 2 * K(i, j) - K(i, i) - K(j, j);
      if (H - L < 1e-12 || eta >= -1e-12) continue;
      const ajn = Math.min(H, Math.max(L, aj - yj * (E[i] - E[j]) / eta));
      if (Math.abs(ajn - aj) < 1e-9) continue;
      const ain = ai + yi * yj * (aj - ajn);
      const b1 = b - E[i] - yi * (ain - ai) * K(i, i) - yj * (ajn - aj) * K(i, j);
      const b2 = b - E[j] - yi * (ain - ai) * K(i, j) - yj * (ajn - aj) * K(j, j);
      alpha[i] = ain; alpha[j] = ajn;
      b = ain > 1e-12 && ain < S.C - 1e-12 ? b1 : ajn > 1e-12 && ajn < S.C - 1e-12 ? b2 : (b1 + b2) / 2;
      last = { i, j };
      return true;
    }
  }
  return false;
}

function dualValue() {
  let s = alpha.reduce((a, x) => a + x, 0);
  for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts.length; j++) s -= 0.5 * alpha[i] * alpha[j] * pts[i].y * pts[j].y * K(i, j);
  return s;
}

function drawPrimal() {
  const cv = $('plane'), ctx = cv.getContext('2d'), W = cv.width, R = 4.5, N = 120;
  const X = x => (x + R) / (2 * R) * W, Y = y => (R - y) / (2 * R) * W;
  const img = ctx.createImageData(N, N);
  for (let jj = 0; jj < N; jj++) for (let ii = 0; ii < N; ii++) {
    const v = f([-R + 2 * R * (ii + 0.5) / N, R - 2 * R * (jj + 0.5) / N]), t = Math.max(-1, Math.min(1, v));
    const c = t >= 0 ? [232 - 117 * t, 226 - 170 * t, 243 - 75 * t] : [232 - 51 * -t, 226 - 72 * -t, 243 - 174 * -t];
    const band = Math.abs(v) < 0.04 ? 60 : Math.abs(Math.abs(v) - 1) < 0.04 ? 30 : 0;
    img.data.set([c[0] - band, c[1] - band, c[2] - band, 255], (jj * N + ii) * 4);
  }
  const off = document.createElement('canvas'); off.width = off.height = N; off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, W);
  pts.forEach((p, k) => {
    const sv = alpha[k] > 1e-6, hot = last && (k === last.i || k === last.j);
    ctx.beginPath(); ctx.arc(X(p.x[0]), Y(p.x[1]), hot ? 8 : sv ? 6 : 4, 0, 7);
    ctx.fillStyle = p.y > 0 ? '#7338a8' : '#b59a45'; ctx.fill();
    ctx.lineWidth = sv ? 2.5 : 1; ctx.strokeStyle = hot ? '#c0281e' : sv ? '#2e2040' : '#fff'; ctx.stroke();
  });
}

function drawDual() {
  const svg = $('dual'), W = 520, H = 300, NS = 'http://www.w3.org/2000/svg', n = pts.length, bw = (W - 40) / n;
  svg.replaceChildren();
  const el = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.appendChild(e); return e; };
  const Y = a => H - 30 - a / S.C * (H - 60);
  el('line', { x1: 30, x2: W - 6, y1: Y(0), y2: Y(0), class: 'axis' });
  el('line', { x1: 30, x2: W - 6, y1: Y(S.C), y2: Y(S.C), class: 'grid' });
  el('text', { x: 26, y: Y(S.C) + 4, class: 'lab end' }).textContent = 'C';
  el('text', { x: 26, y: Y(0) + 4, class: 'lab end' }).textContent = '0';
  pts.forEach((p, k) => {
    const hot = last && (k === last.i || k === last.j), a = alpha[k];
    el('rect', { x: 32 + k * bw, y: Y(a), width: bw - 2, height: Math.max(0.5, Y(0) - Y(a)),
                 fill: hot ? '#c0281e' : p.y > 0 ? '#7338a8' : '#b59a45', opacity: a > 1e-6 ? 0.9 : 0.35 });
  });
  // the legend on two lines, so that it fits in the frame
  el('text', { x: 32, y: H - 14, class: 'lab' }).textContent = 'α_i of each point (violet y = +1, gold y = -1;';
  el('text', { x: 32, y: H - 1, class: 'lab' }).textContent = 'red: the pair of the last step)';
}

function draw() {
  drawPrimal(); drawDual();
  const sv = alpha.filter(a => a > 1e-6).length, bound = alpha.filter(a => a > S.C - 1e-6).length;
  $('iter').textContent = iter; $('dval').textContent = dualValue().toFixed(4);
  $('sv').textContent = sv; $('svC').textContent = bound;
  $('eq').textContent = pts.reduce((s, p, i) => s + alpha[i] * p.y, 0).toExponential(1);
}
function step() { if (smoStep()) { iter++; draw(); } else { stop(); $('status').textContent = 'KKT satisfied'; } }
function stop() { clearInterval(timer); timer = null; $('play').textContent = 'Play'; }
function play() { if (timer) return stop(); $('play').textContent = 'Pause'; timer = setInterval(step, 250); }
function reset() { stop(); makeData(); $('status').textContent = ''; draw(); }

$('kernel').onchange = e => { S.kernel = e.target.value; reset(); };
$('data').onchange = e => { S.data = e.target.value; reset(); };
$('C').oninput = e => { S.C = +e.target.value; $('COut').textContent = e.target.value; reset(); };
$('gamma').oninput = e => { S.gamma = +e.target.value; $('gammaOut').textContent = e.target.value; reset(); };
$('regen').onclick = () => { S.seed = Math.floor(Math.random() * 1e6); reset(); };
$('step').onclick = step; $('play').onclick = play; $('reset').onclick = reset;
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
  if (e.key === 'ArrowRight' && t.type !== 'range') step();
  if (e.key === ' ') { e.preventDefault(); play(); }
});
reset();

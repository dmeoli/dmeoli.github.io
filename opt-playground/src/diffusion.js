// Scene P: a diffusion model in the plane, after Sohl-Dickstein et al. (2015),
// Ho, Jain and Abbeel (2020) and Song et al. (2021): the ideas rebuilt from
// their equations, no figure or code of theirs is used. A point cloud
// (src/diffusion-data.js) is noised by the forward process of a DDPM, an MLP
// (src/diffusion-model.js) is trained with Adam to predict the noise, and the
// reverse process (DDPM or DDIM) brings fresh noise back onto the cloud. The
// four planes: the forward process at the time t of the slider, the learnt
// field at that time, the sampling with its trails, and the loss.

import { schedule, noisy, makeNet, makeTrainer, trainStep, makeSampler, samplerStep, forward, slicedW, exactDisplacement, mulberry, gauss } from './diffusion-model.js';
import { DATASETS, makeData } from './diffusion-data.js';
import { setTex } from './tex.js';

const $ = id => document.getElementById(id);
const S = { data: 'spirals', sched: 'linear', T: 100, depth: 3, width: 64, lr: 0.003, sampler: 'ddpm', seed: 1, t: 30 };
const NUM = new Set(['T', 'depth', 'width', 'lr', 'seed', 't']);
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => {
  if (!(k in S)) return;
  if (NUM.has(k)) { if (Number.isFinite(+v)) S[k] = +v; } else S[k] = v;
});
if (!(S.data in DATASETS)) S.data = 'spirals';
const NDATA = 2000, NSAMPLE = 600, NTRAIL = 40, B = 128, R = 3.2, GRID = 21;

let data, eps, sc, net, tr, steps = 0, losses = [], ema = [], running = false;
let smp = null, trails = [], sampling = false, swLast = null, swNoise = null, lit = null, animT = null;

function reset() {
  stop(); stopSampling();
  data = makeData(S.data, NDATA, S.seed);
  const r = mulberry(S.seed + 77);
  eps = Float64Array.from({ length: 2 * NDATA }, () => gauss(r));
  sc = schedule(S.sched, S.T);
  S.t = Math.min(S.t, S.T);
  $('t').max = S.T; $('t').value = S.t;
  net = makeNet(S.width, S.depth, S.seed); tr = makeTrainer(net, S.seed);
  steps = 0; losses = []; ema = []; smp = null; fieldKey = ''; trails = []; swLast = null;
  swNoise = slicedW(makeSampler(sc, 'ddpm', NSAMPLE, S.seed + 3).X, data);
  save(); draw();
}

function save() { history.replaceState(null, '', '#' + new URLSearchParams(Object.entries(S)).toString()); }

// ------------------------------------------------------------------ training
function trainSome(n) {
  for (let k = 0; k < n; k++) {
    const l = trainStep(tr, data, sc, B, S.lr);
    losses.push(l); ema.push(ema.length ? 0.98 * ema.at(-1) + 0.02 * l : l); steps++;
  }
}
function loop() {
  if (!running) return;
  const t0 = performance.now();
  for (let n = 0; n < 40 && performance.now() - t0 < 30; n++) trainSome(5);
  draw();
  requestAnimationFrame(loop);
}
function start() { running = true; $('train').textContent = 'Pause'; requestAnimationFrame(loop); }
function stop() {
  if (!running) return;
  running = false; $('train').textContent = 'Play';
  startSampling();
}

// ------------------------------------------------------------------ sampling, about 70 frames 30 ms apart
function startSampling() {
  smp = makeSampler(sc, S.sampler, NSAMPLE, S.seed + 11 + steps);
  trails = Array.from({ length: NTRAIL }, (_, i) => [smp.X[2 * i], smp.X[2 * i + 1]]);
  swLast = null;
  if (!sampling) { sampling = true; setTimeout(sampleLoop, 30); }
  $('sample').textContent = 'Stop';
}
function stopSampling() { sampling = false; $('sample').textContent = 'Sample'; }
function sampleLoop() {
  if (!sampling || !smp) return;
  const per = Math.max(1, Math.ceil((smp.ts.length - 1) / 70));
  for (let k = 0; k < per && !smp.done; k++) {
    samplerStep(smp, tr.avg, sc);
    for (let i = 0; i < NTRAIL; i++) trails[i].push(smp.X[2 * i], smp.X[2 * i + 1]);
  }
  if (smp.done) { swLast = slicedW(smp.X, data); stopSampling(); }
  draw();
  if (sampling) setTimeout(sampleLoop, 30);
}

// ------------------------------------------------------------------ colours and frames
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
let P;
function palette() {
  P = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) P[k] = css('--' + k);
}
const frame = cv => {
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height, s = w / (2 * R);
  ctx.fillStyle = P.panel; ctx.fillRect(0, 0, w, h);
  return { ctx, X: x => (x + R) * s, Y: y => h - (y + R) * s, s };
};
function axes(F, cv) {
  const { ctx, X, Y } = F;
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
  for (let v = -3; v <= 3; v++) {
    ctx.beginPath(); ctx.moveTo(X(v), 0); ctx.lineTo(X(v), cv.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, Y(v)); ctx.lineTo(cv.width, Y(v)); ctx.stroke();
  }
  ctx.fillStyle = P['ink-soft']; ctx.font = '11px "IBM Plex Mono", monospace';
  for (const v of [-2, 0, 2]) { ctx.fillText(String(v), X(v) + 3, cv.height - 4); ctx.fillText(String(v), 3, Y(v) - 3); }
}
function dots(F, A, n, color, rad, alpha = 1) {
  const { ctx, X, Y } = F;
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(X(A[2 * i]), Y(A[2 * i + 1]), rad, 0, 2 * Math.PI); ctx.fill(); }
  ctx.globalAlpha = 1;
}
function arrow(ctx, x0, y0, x1, y1, head) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), hh = Math.min(head, 0.45 * L);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  if (hh < 1.5) return;
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - hh * Math.cos(a - 0.45), y1 - hh * Math.sin(a - 0.45));
  ctx.lineTo(x1 - hh * Math.cos(a + 0.45), y1 - hh * Math.sin(a + 0.45));
  ctx.closePath(); ctx.fill();
}

// ------------------------------------------------------------------ the four planes
function drawForward() {
  const cv = $('fwd'), F = frame(cv), { ctx, X, Y } = F, t = S.t, xt = noisy(sc, data, t, eps), a = Math.sqrt(sc.abar[t]);
  axes(F, cv);
  if (lit === 'x0') dots(F, data, NDATA, P.gold, 1.6, 0.8);
  if (lit === 'sig') dots(F, data.map(v => a * v), NDATA, P.gold, 1.6, 0.8);
  if (lit === 'eps' || lit === 'noi') {
    ctx.strokeStyle = P.gold; ctx.fillStyle = P.gold; ctx.lineWidth = 1;
    for (let i = 0; i < NDATA; i += 10) arrow(ctx, X(a * data[2 * i]), Y(a * data[2 * i + 1]), X(xt[2 * i]), Y(xt[2 * i + 1]), 5);
  }
  dots(F, xt, NDATA, P.accent, 1.6, lit ? 0.45 : 0.75);
}

function drawCoef() {
  const cv = $('coef'), ctx = cv.getContext('2d'), w = cv.width, h = cv.height, pad = 22, T = sc.T;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, w, h);
  const X = t => pad + (w - 2 * pad) * t / T, Y = v => h - 16 - (h - 26) * v;
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(T), Y(0)); ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(T), Y(1)); ctx.stroke();
  const curve = (f, color, bold) => {
    ctx.strokeStyle = color; ctx.lineWidth = bold ? 3 : 1.6; ctx.beginPath();
    for (let t = 0; t <= T; t++) t ? ctx.lineTo(X(t), Y(f(t))) : ctx.moveTo(X(t), Y(f(t)));
    ctx.stroke();
  };
  curve(t => Math.sqrt(sc.abar[t]), P.accent, lit === 'sig');
  curve(t => Math.sqrt(1 - sc.abar[t]), P.gold, lit === 'noi');
  ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(X(S.t), Y(0) + 3); ctx.lineTo(X(S.t), Y(1) - 3); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = P['ink-soft']; ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.fillText('0', X(0) - 3, h - 3); ctx.fillText('T', X(T) - 3, h - 3); ctx.fillText('1', 6, Y(1) + 4);
}

// redrawn only when the network, t, the option or the colours change
let fieldKey = '';
function drawField() {
  const key = [steps, S.t, $('exact').checked, P.accent, net.sizes.join()].join('|');
  if (key === fieldKey) return;
  fieldKey = key;
  const cv = $('field'), F = frame(cv), { ctx, X, Y, s } = F, t = S.t, T = sc.T;
  axes(F, cv);
  dots(F, data, NDATA, P['ink-soft'], 1.3, 0.35);
  const cell = 2 * R / GRID, pts = [], ex = $('exact').checked && t > 0;
  let mx = 0, mxe = 0;
  const sd = Math.sqrt(1 - sc.abar[t]);
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const x = -R + (i + 0.5) * cell, y = -R + (j + 0.5) * cell, e = forward(tr.avg, x, y, Math.max(t, 1), T);
    const p = { x, y, dx: -sd * e[0], dy: -sd * e[1] };
    if (ex) [p.ex, p.ey] = exactDisplacement(data, sc, t, x, y);
    mx = Math.max(mx, Math.hypot(p.dx, p.dy)); if (ex) mxe = Math.max(mxe, Math.hypot(p.ex, p.ey));
    pts.push(p);
  }
  const ref = Math.max(mx, mxe, 1e-9);
  const draw1 = (x, y, dx, dy, color, lw) => {
    const L = Math.hypot(dx, dy); if (!L) return;
    const len = cell * s * 0.9 * Math.sqrt(L / ref);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
    arrow(ctx, X(x), Y(y), X(x) + len * dx / L, Y(y) - len * dy / L, 5);
  };
  for (const p of pts) draw1(p.x, p.y, p.dx, p.dy, P.accent, 1.6);
  if (ex) for (const p of pts) draw1(p.x, p.y, p.ex, p.ey, P.gold, 1);
  $('fieldNote').innerHTML = t === 0 ? 'At t = 0 there is no noise to remove: the arrows are those of t = 1.'
    : `t = <b>${t}</b>, longest move <b>${mx.toFixed(2)}</b>` + (ex ? `, exact <b>${mxe.toFixed(2)}</b>` : '');
}

function drawReverse() {
  const cv = $('rev'), F = frame(cv), { ctx, X, Y } = F;
  axes(F, cv);
  dots(F, data, NDATA, P['ink-soft'], 1.3, 0.35);
  if (!smp) {
    ctx.fillStyle = P['ink-soft']; ctx.font = 'italic 15px Spectral, Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('Press Sample, or pause the training', cv.width / 2, cv.height / 2); ctx.textAlign = 'start';
    $('revNote').textContent = '';
    return;
  }
  ctx.strokeStyle = P['accent-2']; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.22;
  for (const tr of trails) {
    ctx.beginPath(); ctx.moveTo(X(tr[0]), Y(tr[1]));
    for (let k = 2; k < tr.length; k += 2) ctx.lineTo(X(tr[k]), Y(tr[k + 1]));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const k0 = smp.k > 0, n = smp.n;
  if (k0 && lit === 'xt') dots(F, smp.prev, n, P.gold, 2, 0.9);
  if (k0 && lit === 'hat') dots(F, smp.x0, n, P.gold, 2, 0.9);
  if (k0 && (lit === 'drift' || lit === 'z')) {
    ctx.strokeStyle = P.gold; ctx.fillStyle = P.gold; ctx.lineWidth = 1;
    for (let i = 0; i < n; i += 2) {
      const x = smp.prev[2 * i] + (lit === 'z' ? smp.drift[2 * i] : 0), y = smp.prev[2 * i + 1] + (lit === 'z' ? smp.drift[2 * i + 1] : 0);
      const d = lit === 'z' ? smp.noise : smp.drift;
      arrow(ctx, X(x), Y(y), X(x + d[2 * i]), Y(y + d[2 * i + 1]), 4);
    }
  }
  dots(F, smp.X, n, P.accent, 2, lit ? 0.5 : 0.9);
  const t = smp.ts[smp.k];
  $('revNote').textContent = smp.done ? `t = 0 after ${smp.ts.length - 1} steps` : `t = ${t}, step ${smp.k} of ${smp.ts.length - 1}`;
}

function drawLoss() {
  const cv = $('lossc'), ctx = cv.getContext('2d'), w = cv.width, h = cv.height, pl = 34, pb = 20;
  ctx.fillStyle = P.panel; ctx.fillRect(0, 0, w, h);
  const n = losses.length, top = 1.2;
  const X = k => pl + (w - pl - 8) * k / Math.max(1, n - 1), Y = v => h - pb - (h - pb - 8) * Math.min(v, top) / top;
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.fillStyle = P['ink-soft']; ctx.font = '11px "IBM Plex Mono", monospace';
  for (const v of [0, 0.4, 0.8, 1.2]) { ctx.beginPath(); ctx.moveTo(pl, Y(v)); ctx.lineTo(w - 8, Y(v)); ctx.stroke(); ctx.fillText(v.toFixed(1), 4, Y(v) + 4); }
  ctx.fillText('0', pl, h - 5); if (n > 1) { ctx.textAlign = 'end'; ctx.fillText(String(n), w - 8, h - 5); ctx.textAlign = 'start'; }
  if (n < 2) return;
  const stride = Math.max(1, Math.floor(n / 600));
  const line = (A, color, width, alpha) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.beginPath();
    for (let k = 0; k < n; k += stride) k ? ctx.lineTo(X(k), Y(A[k])) : ctx.moveTo(X(k), Y(A[k]));
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  line(losses, P['accent-2'], 1, 0.35);
  line(ema, P.accent, 2, 1);
}

function draw() {
  const a = sc.abar[S.t];
  $('count').textContent = steps;
  $('tv').textContent = S.t;
  setTex($('explain'), `At \\(t = ${S.t}\\) of \\(T = ${sc.T}\\): \\(\\bar\\alpha_t = ${a.toFixed(4)}\\), so a point keeps
    \\(\\sqrt{\\bar\\alpha_t} = ${Math.sqrt(a).toFixed(3)}\\) of its position and gets noise of standard deviation
    \\(\\sqrt{1-\\bar\\alpha_t} = ${Math.sqrt(1 - a).toFixed(3)}\\).` + (steps ? '' : ' The network is not trained yet: press Play.'));
  $('eqDDPM').hidden = S.sampler !== 'ddpm'; $('eqDDIM').hidden = S.sampler === 'ddpm';
  drawForward(); drawCoef(); drawField(); drawReverse(); drawLoss();
  const last = ema.length ? ema.at(-1) : null;
  $('lossNote').innerHTML = (last === null ? 'No step yet.' : `moving average of the loss <b>${last.toFixed(3)}</b> after <b>${steps}</b> steps.`)
    + ` Sliced Wasserstein distance from the data: noise <b>${swNoise.toFixed(3)}</b>`
    + (swLast === null ? '' : `, last samples <b>${swLast.toFixed(3)}</b>`) + '.';
}

// ------------------------------------------------------------------ the formulas, part by part
for (const f of document.querySelectorAll('.formula')) {
  const fig = f.closest('.df');
  const part = e => { const el = e.target.closest && e.target.closest('[class*="p-"]'); if (!el) return null; const c = [...el.classList].find(c => c.startsWith('p-')); return c ? c.slice(2) : null; };
  const set = v => { if (v === lit) return; lit = v; for (const g of document.querySelectorAll('.df')) delete g.dataset.lit; if (v) fig.dataset.lit = v; draw(); };
  f.addEventListener('mouseover', e => set(part(e)));
  f.addEventListener('pointerdown', e => set(part(e)));
  f.addEventListener('mouseleave', () => set(null));
}

// ------------------------------------------------------------------ controls
const sel = $('data');
for (const [k, v] of Object.entries(DATASETS)) sel.add(new Option(v, k));
for (const k of ['data', 'sched', 'T', 'depth', 'width', 'lr', 'sampler', 'seed']) {
  $(k).value = S[k];
  $(k).onchange = e => {
    S[k] = NUM.has(k) ? +e.target.value : e.target.value;
    if (k === 'lr') save();
    else if (k === 'sampler') { save(); if (steps) startSampling(); else draw(); }
    else reset();
  };
}
$('t').oninput = e => { S.t = +e.target.value; save(); draw(); };
$('anim').onclick = () => {
  if (animT) { clearInterval(animT); animT = null; $('anim').textContent = 'Animate'; return; }
  $('anim').textContent = 'Stop';
  if (S.t >= sc.T) S.t = 0;
  animT = setInterval(() => {
    S.t = Math.min(sc.T, S.t + Math.max(1, Math.round(sc.T / 100)));
    $('t').value = S.t; draw();
    if (S.t >= sc.T) { clearInterval(animT); animT = null; $('anim').textContent = 'Animate'; save(); }
  }, 40);
};
$('exact').onchange = () => draw();
$('sample').onclick = () => sampling ? (stopSampling(), draw()) : startSampling();
$('reset').onclick = reset;
$('step').onclick = () => { const was = running; running = false; $('train').textContent = 'Play'; trainSome(50); draw(); if (was) startSampling(); };
$('train').onclick = () => running ? stop() : start();
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('select, input, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); $('train').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); $('step').click(); }
});
// a change of the theme on the site, or of the system, recolours the canvases
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { palette(); draw(); });

palette();
reset();

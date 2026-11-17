// Scene I: inside the layers of a convolutional network, after C. Olah, "Conv
// Nets: A Modular Perspective" and "Understanding Convolutions" (2014),
// https://colah.github.io/, and Olah, Mordvintsev and Schubert, "Feature
// Visualization" (Distill, 2017): the ideas rebuilt from their equations, no
// figure or code of theirs is used. A network conv 3x3 -> ReLU -> pool ->
// conv 3x3 -> ReLU -> pool -> softmax (src/convnet.js) is trained with Adam on
// synthetic digits (src/convdata.js); the reader draws the input and sees the
// filters, the maps, the pooled maps, the receptive field of a cell, one filter
// sliding over the input, and the input that maximizes each layer-2 channel;
// last, what the network looks at: the saliency of a class (Simonyan et al.
// 2014) and an adversarial example made by iterated FGSM (Goodfellow et al.
// 2015).

import { makeNet, forward, trainBatch, accuracy, visualize, receptiveField, classScore, fgsm, argmax, N, P1, P2, NC } from './convnet.js';
import { makeSet } from './convdata.js';
import { rng } from './nn.js';
import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);
const S = { c1: 6, c2: 8, lr: 0.003, seed: 1, f: 0, salc: -1, salx: 0, tgt: -1, eps: 0.1, iters: 10 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S && Number.isFinite(+v)) S[k] = +v; });
const NTRAIN = 6000, NTEST = 1000, B = 32;

let net, data = null, test = null, steps = 0, losses = [], acc = null, evalAt = 0, evalOk = 0;
let order = [], at = 0, shuf = rng(1);
let x = new Float64Array(N * N), F = null, truth = null, hover = null;
let running = false, pos = 10 * N + 9, sliding = null, viz = [], vizNext = 0, vizStamp = -1;
let adv = null;                           // the last attack: { x0, xa, from, target }

// ------------------------------------------------------------------ the data, made in chunks
// the held-out digits first, then the training digits, a slice per frame;
// training may start as soon as the first 500 are written
const pool = { X: [], Y: [] };
function makeData(ready) {
  const te = { X: [], Y: [] };
  const chunk = () => {
    if (te.X.length < NTEST) { const p = makeSet(200, 2 + te.X.length / 200); te.X.push(...p.X); te.Y.push(...p.Y); }
    else { const p = makeSet(250, 100 + pool.X.length / 250); pool.X.push(...p.X); pool.Y.push(...p.Y); }
    if (te.X.length >= NTEST && !test) test = te;
    if (test && pool.X.length >= 500 && !data) { data = pool; ready(); }
    if (pool.X.length < NTRAIN) requestAnimationFrame(chunk);
    if (!data) $('explain').textContent = t(`Writing the digits: ${te.X.length + pool.X.length} of ${NTEST + NTRAIN}.`, `Scrittura delle cifre: ${te.X.length + pool.X.length} su ${NTEST + NTRAIN}.`);
    else if (!running) refresh();
  };
  chunk();
}

function reset() {
  stop();
  S.f = Math.min(S.f, S.c1 - 1);
  net = makeNet(S.c1, S.c2, S.seed);
  steps = 0; losses = []; acc = null; evalAt = 0; evalOk = 0; at = 0; order = []; shuf = rng(S.seed + 1);
  viz = []; vizNext = 0; vizStamp = -1;
  acc = null; kick();
  save(); refresh();
}

function step() {
  if (at + B > order.length) {           // a new epoch: the training set reshuffled
    order = data.X.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(shuf() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    at = 0;
  }
  losses.push(trainBatch(net, data.X, data.Y, order.slice(at, at + B), S.lr));
  if (losses.length > 50) losses.shift();
  at += B; steps++;
}

// the held-out accuracy, computed a slice per frame while training
function evaluate() {
  const to = Math.min(NTEST, evalAt + 50);
  evalOk += accuracy(net, test.X, test.Y, evalAt, to); evalAt = to;
  if (evalAt >= NTEST) { acc = evalOk / NTEST; evalAt = 0; evalOk = 0; }
}

function loop() {
  if (!running) return;
  const t0 = performance.now();
  for (let n = 0; n < 60 && performance.now() - t0 < 45; n++) step();
  evaluate();
  // while training, one channel of the visualization is redone every 0.6 s
  if (t0 - vizStamp > 600) { vizStamp = t0; viz[vizNext % S.c2] = visualize(net, vizNext % S.c2, S.seed); vizNext = (vizNext + 1) % S.c2; }
  refresh();
  requestAnimationFrame(loop);
}

// when paused, the accuracy and the visualizations are brought up to date a
// slice per frame, so that the page stays responsive
let idle = false, idleEval = false;
function kick() {
  idleEval = true; evalAt = 0; evalOk = 0; vizNext = 0;
  if (!idle) { idle = true; requestAnimationFrame(idleWork); }
}
function idleWork() {
  if (running || !data) { idle = false; return; }
  if (idleEval) {
    const to = Math.min(NTEST, evalAt + 250);
    evalOk += accuracy(net, test.X, test.Y, evalAt, to); evalAt = to;
    if (evalAt >= NTEST) { acc = evalOk / NTEST; evalAt = 0; evalOk = 0; idleEval = false; refresh(); }
  } else if (vizNext < S.c2) { viz[vizNext] = visualize(net, vizNext, S.seed); vizNext++; drawLayer2(); }
  else { idle = false; return; }
  requestAnimationFrame(idleWork);
}

function start() {
  if (!data) return;
  running = true; $('train').textContent = t('Pause', 'Pausa');
  requestAnimationFrame(loop);
}
function stop() {
  if (!running) return;
  running = false; $('train').textContent = t('Play', 'Avvia');
  kick(); refresh();
}

// ------------------------------------------------------------------ colours
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
function ramp(a, b, n = 33) {             // n colours from a to b
  return Array.from({ length: n }, (_, k) => `rgb(${a.map((v, i) => Math.round(v + k / (n - 1) * (b[i] - v))).join(',')})`);
}
let P = null;
function palette() {
  const G = hex(css('--ground')), I = hex(css('--ink')), A = hex(css('--accent')), Gd = hex(css('--gold'));
  P = { ink: ramp(G, I), acc: ramp(G, A), gold: ramp(G, Gd), ground: css('--ground'), panel: css('--panel'), rule: css('--rule'),
    accent: css('--accent'), accent2: css('--accent-2'), lilac: css('--lilac'), goldc: css('--gold'), soft: css('--ink-soft'), inkc: css('--ink') };
}
const seq = (pal, t) => pal[Math.max(0, Math.min(32, Math.round(32 * t)))];
const div = t => t >= 0 ? seq(P.acc, t) : seq(P.gold, -t);

// ------------------------------------------------------------------ strips of maps
// n maps of side s, one column per map (wrapping after `cols`), on a canvas
function strip(cv, n, s, cols) {
  const gap = 6, rows = Math.ceil(n / cols), pitch = (cv.width + gap) / cols, px = Math.max(1, Math.floor((pitch - gap) / s)), side = px * s;
  const h = rows * side + (rows - 1) * gap;
  if (cv.height !== h) cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  const at = m => ({ x: Math.round((m % cols) * pitch + (pitch - gap - side) / 2), y: Math.floor(m / cols) * (side + gap) });
  return { ctx, px, side, at, n, s, cols, cv };
}
function paint(L, m, arr, off, color) {
  const { ctx, px, s } = L, { x: x0, y: y0 } = L.at(m);
  for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) { ctx.fillStyle = color(arr[off + i * s + j]); ctx.fillRect(x0 + j * px, y0 + i * px, px, px); }
}
function outline(L, m, i0, i1, j0, j1, color, w = 2) {
  const { ctx, px } = L, { x, y } = L.at(m);
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.strokeRect(x + j0 * px + w / 2, y + i0 * px + w / 2, (j1 - j0 + 1) * px - w, (i1 - i0 + 1) * px - w);
}
const maxOf = a => { let m = 1e-9; for (const v of a) if (v > m) m = v; return m; };
const absMax = a => { let m = 1e-9; for (const v of a) if (Math.abs(v) > m) m = Math.abs(v); return m; };
const strips = {};

function drawInput() {
  const cv = $('in'), ctx = cv.getContext('2d'), c = cv.width / N;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { ctx.fillStyle = seq(P.ink, x[i * N + j]); ctx.fillRect(j * c, i * c, c, c); }
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
  for (let k = 1; k < N; k++) { ctx.beginPath(); ctx.moveTo(k * c, 0); ctx.lineTo(k * c, cv.height); ctx.moveTo(0, k * c); ctx.lineTo(cv.width, k * c); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (hover) {
    const [r0, r1, c0, c1] = receptiveField(hover.stage, hover.i, hover.j);
    ctx.fillStyle = P.accent; ctx.globalAlpha = 0.18; ctx.fillRect(c0 * c, r0 * c, (c1 - c0 + 1) * c, (r1 - r0 + 1) * c); ctx.globalAlpha = 1;
    ctx.strokeStyle = P.accent; ctx.lineWidth = 3; ctx.strokeRect(c0 * c + 1.5, r0 * c + 1.5, (c1 - c0 + 1) * c - 3, (r1 - r0 + 1) * c - 3);
  }
}

// the bars of the 10 probabilities; `ref`, when given, is outlined in gold
function drawProb(cv = $('prob'), prob = F.prob, ref = null) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, w = W / NC, top = 12, base = H - 22;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, W, H);
  const best = argmax(prob);
  ctx.font = '12px IBM Plex Mono, monospace'; ctx.textAlign = 'center';
  for (let k = 0; k < NC; k++) {
    const h = prob[k] * (base - top);
    ctx.fillStyle = P.rule; ctx.fillRect(k * w + 6, top, w - 12, base - top);
    if (k === ref) { ctx.strokeStyle = P.goldc; ctx.lineWidth = 2; ctx.strokeRect(k * w + 5, top - 1, w - 10, base - top + 2); }
    ctx.fillStyle = k === best ? P.accent : P.accent2; ctx.globalAlpha = k === best ? 1 : 0.55;
    ctx.fillRect(k * w + 6, base - h, w - 12, h); ctx.globalAlpha = 1;
    ctx.fillStyle = k === best ? P.accent : P.soft; ctx.fillText(k, k * w + w / 2, H - 6);
  }
  ctx.textAlign = 'start';
}

function drawLayer1() {
  const c1 = S.c1, cols = c1;
  let L = strips.f1 = strip($('f1'), c1, 3, cols);
  const wm = absMax(net.w1);
  for (let m = 0; m < c1; m++) { paint(L, m, net.w1, m * 9, v => div(v / wm)); if (m === S.f) outline(L, m, 0, 2, 0, 2, P.inkc, 2); }
  L = strips.m1 = strip($('m1'), c1, N, cols);
  for (let m = 0; m < c1; m++) { const mx = maxOf(F.a1.subarray(m * N * N, (m + 1) * N * N)); paint(L, m, F.a1, m * N * N, v => seq(P.acc, v / mx)); }
  L = strips.q1 = strip($('q1'), c1, P1, cols);
  for (let m = 0; m < c1; m++) { const mx = maxOf(F.p1.subarray(m * P1 * P1, (m + 1) * P1 * P1)); paint(L, m, F.p1, m * P1 * P1, v => seq(P.acc, v / mx)); }
  marks();
}

function drawLayer2() {
  const c2 = S.c2, cols = c2 > 8 ? Math.ceil(c2 / 2) : c2;
  let L = strips.m2 = strip($('m2'), c2, P1, cols);
  for (let m = 0; m < c2; m++) { const mx = maxOf(F.a2.subarray(m * P1 * P1, (m + 1) * P1 * P1)); paint(L, m, F.a2, m * P1 * P1, v => seq(P.acc, v / mx)); }
  L = strips.q2 = strip($('q2'), c2, P2, cols);
  for (let m = 0; m < c2; m++) { const mx = maxOf(F.p2.subarray(m * P2 * P2, (m + 1) * P2 * P2)); paint(L, m, F.p2, m * P2 * P2, v => seq(P.acc, v / mx)); }
  L = strips.viz = strip($('viz'), c2, N, cols);
  for (let m = 0; m < c2; m++) if (viz[m]) paint(L, m, viz[m], 0, v => seq(P.ink, v));
  marks();
}

// the hovered cell, outlined on its strip
function marks() {
  if (!hover || !strips[hover.stage]) return;
  const L = strips[hover.stage];
  outline(L, hover.m, hover.i, hover.i, hover.j, hover.j, P.goldc, Math.max(1, Math.min(3, L.px / 2)));
}

// ------------------------------------------------------------------ one filter sliding
const SL = { cell: 12, ix: 12, iy: 32, kx: 272, ky: 112, kc: 26, ox: 372, oy: 32 };
function drawSlide() {
  const cv = $('slide'), ctx = cv.getContext('2d'), { cell, ix, iy, kx, ky, kc, ox, oy } = SL, f = S.f;
  const pi = Math.floor(pos / N), pj = pos % N;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.font = '11px IBM Plex Mono, monospace'; ctx.fillStyle = P.soft; ctx.textAlign = 'start';
  ctx.fillText(t('input x', 'ingresso x'), ix, 10); ctx.fillText(`${t('filter', 'filtro')} ${f + 1}`, kx, ky - 10); ctx.fillText(t(`map y of filter ${f + 1}`, `mappa y del filtro ${f + 1}`), ox, 10);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { ctx.fillStyle = seq(P.ink, x[i * N + j]); ctx.fillRect(ix + j * cell, iy + i * cell, cell, cell); }
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.strokeRect(ix + 0.5, iy + 0.5, N * cell - 1, N * cell - 1);
  // the window of the kernel, which leaves the grid at the border (zero padding)
  ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
  ctx.strokeRect(ix + (pj - 1) * cell + 1, iy + (pi - 1) * cell + 1, 3 * cell - 2, 3 * cell - 2);
  // the kernel, with its weights
  const wm = absMax(net.w1.subarray(f * 9, f * 9 + 9));
  ctx.textAlign = 'center'; ctx.font = '9px IBM Plex Mono, monospace';
  for (let u = 0; u < 3; u++) for (let v = 0; v < 3; v++) {
    const w = net.w1[f * 9 + u * 3 + v];
    ctx.fillStyle = div(w / wm); ctx.fillRect(kx + v * kc, ky + u * kc, kc - 1, kc - 1);
    ctx.fillStyle = Math.abs(w / wm) > 0.55 ? P.ground : P.inkc; ctx.fillText(w.toFixed(1), kx + v * kc + kc / 2, ky + u * kc + kc / 2 + 3);
  }
  // the map, filled up to the current position
  const a = F.a1, mo = f * N * N, mm = maxOf(a.subarray(mo, mo + N * N));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const k = i * N + j;
    ctx.fillStyle = k <= pos ? seq(P.acc, a[mo + k] / mm) : P.panel;
    ctx.fillRect(ox + j * cell, oy + i * cell, cell, cell);
  }
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.strokeRect(ox + 0.5, oy + 0.5, N * cell - 1, N * cell - 1);
  ctx.strokeStyle = P.goldc; ctx.lineWidth = 2; ctx.strokeRect(ox + pj * cell + 1, oy + pi * cell + 1, cell - 2, cell - 2);
  // the window feeds the kernel, the kernel the cell
  ctx.strokeStyle = P.accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.beginPath();
  ctx.moveTo(ix + (pj + 2) * cell, iy + (pi + 0.5) * cell); ctx.lineTo(kx, ky + 1.5 * kc);
  ctx.moveTo(kx + 3 * kc, ky + 1.5 * kc); ctx.lineTo(ox + pj * cell, oy + (pi + 0.5) * cell); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
  // the arithmetic of this position
  const z = F.z1[mo + pos];
  let terms = 0;
  for (let u = 0; u < 3; u++) for (let v = 0; v < 3; v++) { const r = pi + u - 1, c = pj + v - 1; if (r >= 0 && c >= 0 && r < N && c < N && x[r * N + c] > 0) terms++; }
  $('pos').textContent = `(i, j) = (${pi}, ${pj})`;
  $('sum').textContent = `b + Σ w·x = ${net.b1[f].toFixed(2)} + (${(z - net.b1[f]).toFixed(2)}) = ${z.toFixed(2)}, ${t('so', 'quindi')} y = ${Math.max(0, z).toFixed(2)}` +
    t(` (${terms} of the 9 pixels under the window are inked)`, ` (${terms} dei 9 pixel sotto la finestra sono inchiostrati)`);
}

// ------------------------------------------------------------------ what the network looks at
// a 20x20 image on a canvas: cell c at (x0, y0), coloured by `color`
function grid(ctx, arr, x0, y0, c, color) {
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { ctx.fillStyle = color(arr[i * N + j]); ctx.fillRect(x0 + j * c, y0 + i * c, c, c); }
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, N * c - 1, N * c - 1);
}

function drawSaliency() {
  const c = S.salc < 0 ? argmax(F.prob) : S.salc, { value, dx } = classScore(net, x, c);
  const m = S.salx ? dx.map((g, k) => g * x[k]) : dx, mx = absMax(m);
  const cv = $('sal'), ctx = cv.getContext('2d');
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  grid(ctx, m, 0, 0, cv.width / N, v => div(v / mx));
  $('salnote').textContent = t(`${S.salx ? '∂s/∂x × x' : '∂s/∂x'} for class ${c}, whose score is s = ${value.toFixed(2)} ` +
    `(probability ${F.prob[c].toFixed(2)}); the largest |${S.salx ? 'value' : 'gradient'}| is ${mx.toFixed(3)}.`,
    `${S.salx ? '∂s/∂x × x' : '∂s/∂x'} per la classe ${c}, il cui punteggio è s = ${value.toFixed(2)} ` +
    `(probabilità ${F.prob[c].toFixed(2)}); il più grande |${S.salx ? 'valore' : 'gradiente'}| è ${mx.toFixed(3)}.`);
}

function drawAdversarial() {
  const cv = $('adv'), ctx = cv.getContext('2d'), c = 9, top = 24, gap = (cv.width - 3 * N * c) / 2;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.font = '11px IBM Plex Mono, monospace'; ctx.fillStyle = P.soft; ctx.textAlign = 'start';
  $('useadv').disabled = !adv;
  if (!adv) {
    ctx.fillText(t('press Attack to perturb the current input', "si prema Attacca per perturbare l'ingresso corrente"), 0, 14);
    drawProb($('advprob'), F.prob);
    $('advnote').textContent = t(`The network says ${argmax(F.prob)} on the input; choose a target and ε, then Attack.`,
      `Sull'ingresso la rete dice ${argmax(F.prob)}; si scelgano un bersaglio ed ε, poi Attacca.`);
    return;
  }
  const d = adv.xa.map((v, k) => v - adv.x0[k]), e = Math.max(adv.eps, 1e-9);
  ctx.fillText('x', 0, 14); ctx.fillText(t(`x' − x, scaled by 1/ε`, `x' − x, scalato di 1/ε`), N * c + gap, 14); ctx.fillText(`x'`, 2 * (N * c + gap), 14);
  grid(ctx, adv.x0, 0, top, c, v => seq(P.ink, v));
  grid(ctx, d, N * c + gap, top, c, v => div(v / e));
  grid(ctx, adv.xa, 2 * (N * c + gap), top, c, v => seq(P.ink, v));
  const pa = forward(net, adv.xa).prob, p0 = forward(net, adv.x0).prob, now = argmax(pa), was = argmax(p0);
  drawProb($('advprob'), pa, adv.target ?? was);
  let l1 = 0, linf = 0, moved = 0;
  for (const v of d) { l1 += Math.abs(v); linf = Math.max(linf, Math.abs(v)); if (Math.abs(v) > 1e-9) moved++; }
  const aim = adv.target === null ? t(`away from ${was}`, `lontano da ${was}`) : t(`towards ${adv.target}`, `verso ${adv.target}`);
  $('advnote').textContent = t(`${adv.steps} step${adv.steps > 1 ? 's' : ''} ${aim} with ε = ${adv.eps.toFixed(2)}: ${moved} of ${N * N} pixels moved, ` +
    `by ${(l1 / (N * N)).toFixed(3)} on average and at most ${linf.toFixed(2)}. The network said ${was} (p ${p0[was].toFixed(2)}) ` +
    `and now says ${now} (p ${pa[now].toFixed(2)})` + (now === was ? ', unchanged: try a larger ε or more steps.' :
    adv.target !== null && now !== adv.target ? `, not yet the target ${adv.target}.` : '.') + ' The bars are the probabilities on x′, the gold outline the class aimed at (or left).',
    `${adv.steps} pass${adv.steps > 1 ? 'i' : 'o'} ${aim} con ε = ${adv.eps.toFixed(2)}: ${moved} pixel su ${N * N} spostati, ` +
    `in media di ${(l1 / (N * N)).toFixed(3)} e al più di ${linf.toFixed(2)}. La rete diceva ${was} (p ${p0[was].toFixed(2)}) ` +
    `e ora dice ${now} (p ${pa[now].toFixed(2)})` + (now === was ? ', invariata: si provi un ε più grande o più passi.' :
    adv.target !== null && now !== adv.target ? `, non ancora il bersaglio ${adv.target}.` : '.') + ' Le barre sono le probabilità su x′, il contorno oro la classe cercata (o lasciata).');
}

function attack() {
  if (!data) return;
  const target = S.tgt < 0 ? null : S.tgt;
  adv = { x0: Float64Array.from(x), xa: fgsm(net, x, { target, eps: S.eps, steps: S.iters }), target, eps: S.eps, steps: S.iters };
  drawAdversarial();
}

// ------------------------------------------------------------------ everything
function refresh() {
  if (!P) palette();
  F = forward(net, x);
  drawInput(); drawProb(); drawSlide(); drawLayer1(); drawLayer2(); drawSaliency(); drawAdversarial();
  const ep = data ? steps * B / NTRAIN : 0;
  $('count').textContent = `${ep.toFixed(2)} · ${steps}`;
  $('step').disabled = $('train').disabled = !data;
  if (!data) return;
  let best = 0; for (let k = 1; k < NC; k++) if (F.prob[k] > F.prob[best]) best = k;
  const L = losses.length ? losses.reduce((s, v) => s + v, 0) / losses.length : null;
  const A = acc === null ? '…' : (100 * acc).toFixed(1) + '%';
  $('explain').textContent = t(`Held-out accuracy ${A} on ${NTEST} digits not used in training` +
    (L === null ? '' : `, mean loss ${L.toFixed(3)} on the last ${losses.length} batches of ${B}`) +
    `; on the input the network says ${best}, with probability ${F.prob[best].toFixed(2)}` +
    (data.X.length < NTRAIN ? ` (training digits written so far: ${data.X.length} of ${NTRAIN}).` : '.'),
    `Accuratezza ${A} su ${NTEST} cifre non usate nell'addestramento` +
    (L === null ? '' : `, loss media ${L.toFixed(3)} sugli ultimi ${losses.length} batch da ${B}`) +
    `; sull'ingresso la rete dice ${best}, con probabilità ${F.prob[best].toFixed(2)}` +
    (data.X.length < NTRAIN ? ` (cifre di addestramento scritte finora: ${data.X.length} su ${NTRAIN}).` : '.'));
  $('truth').textContent = truth === null ? '' : t(`written as a ${truth}`, `scritta come ${truth}`);
  if (hover) {
    const [r0, r1, c0, c1] = receptiveField(hover.stage, hover.i, hover.j), name = hover.stage[0] === 'm' ? t('map', 'mappa') : t('pooled map', 'mappa ridotta');
    const arr = { m1: F.a1, q1: F.p1, m2: F.a2, q2: F.p2 }[hover.stage], s = { m1: N, q1: P1, m2: P1, q2: P2 }[hover.stage];
    const v = arr[hover.m * s * s + hover.i * s + hover.j].toFixed(2), np = (r1 - r0 + 1) * (c1 - c0 + 1);
    $('hover').textContent = t(`layer ${hover.stage[1]}, ${name} ${hover.m + 1}, cell (${hover.i}, ${hover.j}) = ${v}: ` +
      `it depends on rows ${r0}-${r1} and columns ${c0}-${c1} of the input (${np} pixels).`,
      `strato ${hover.stage[1]}, ${name} ${hover.m + 1}, cella (${hover.i}, ${hover.j}) = ${v}: ` +
      `dipende dalle righe ${r0}-${r1} e dalle colonne ${c0}-${c1} dell'ingresso (${np} pixel).`);
  } else $('hover').textContent = t('Hover a cell of a map to see its receptive field.', 'Si passi col puntatore su una cella di una mappa per vederne il campo recettivo.');
}

function save() { history.replaceState(null, '', '#' + new URLSearchParams({ c1: S.c1, c2: S.c2, lr: S.lr, seed: S.seed, f: S.f, salc: S.salc, salx: S.salx, tgt: S.tgt, eps: S.eps, iters: S.iters })); }

// ------------------------------------------------------------------ the reader's hand
function canvasPoint(cv, e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height];
}
let drawing = false, last = null;
function brush(gx, gy) {                  // a soft round brush, in grid units
  for (let i = Math.floor(gy - 2); i <= gy + 2; i++) for (let j = Math.floor(gx - 2); j <= gx + 2; j++) {
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const d = Math.hypot(i + 0.5 - gy, j + 0.5 - gx), v = Math.min(1, Math.max(0, (1.75 - d) / 0.8));
    if (v > x[i * N + j]) x[i * N + j] = v;
  }
}
$('in').addEventListener('pointerdown', e => { drawing = true; last = null; truth = null; adv = null; try { $('in').setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ } ink(e); });
$('in').addEventListener('pointermove', e => { if (drawing) ink(e); });
$('in').addEventListener('pointerup', () => { drawing = false; });
$('in').addEventListener('pointercancel', () => { drawing = false; });
function ink(e) {
  const [px, py] = canvasPoint($('in'), e), c = $('in').width / N, p = [px / c, py / c];
  if (last) { const n = Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1]) / 0.3); for (let t = 1; t <= n; t++) brush(last[0] + (p[0] - last[0]) * t / n, last[1] + (p[1] - last[1]) * t / n); }
  else brush(p[0], p[1]);
  last = p; refresh();
}
$('clear').onclick = () => { x = new Float64Array(N * N); truth = null; adv = null; refresh(); };
let sampleR = rng(7);
$('sample').onclick = () => { if (!test) return; const k = Math.floor(sampleR() * NTEST); x = Float64Array.from(test.X[k]); truth = test.Y[k]; adv = null; refresh(); };

// hovering a map shows the receptive field of the cell
for (const stage of ['m1', 'q1', 'm2', 'q2']) {
  const cv = $(stage), s = { m1: N, q1: P1, m2: P1, q2: P2 }[stage];
  cv.addEventListener('pointermove', e => {
    const L = strips[stage]; if (!L) return;
    const [px, py] = canvasPoint(cv, e);
    let h = null;
    for (let m = 0; m < L.n; m++) {
      const { x: x0, y: y0 } = L.at(m), j = Math.floor((px - x0) / L.px), i = Math.floor((py - y0) / L.px);
      if (i >= 0 && j >= 0 && i < s && j < s) { h = { stage, m, i, j }; break; }
    }
    if (JSON.stringify(h) !== JSON.stringify(hover)) { hover = h; refresh(); }
  });
  cv.addEventListener('pointerleave', () => { hover = null; refresh(); });
}
// choosing the filter that slides, and the position of its window
const pick = e => {
  const L = strips.f1 || strips.m1, [px] = canvasPoint($('f1'), e), pitch = ($('f1').width + 6) / L.cols, m = Math.floor(px / pitch);
  if (m >= 0 && m < S.c1) { S.f = m; save(); refresh(); }
};
$('f1').addEventListener('click', pick);
$('m1').addEventListener('click', pick);
$('slide').addEventListener('click', e => {
  const [px, py] = canvasPoint($('slide'), e), { cell, ix, iy, ox, oy } = SL;
  for (const [x0, y0] of [[ix, iy], [ox, oy]]) {
    const j = Math.floor((px - x0) / cell), i = Math.floor((py - y0) / cell);
    if (i >= 0 && j >= 0 && i < N && j < N) { pos = i * N + j; stopSlide(); refresh(); return; }
  }
});
function stopSlide() { clearInterval(sliding); sliding = null; $('play').textContent = t('Slide', 'Scorri'); }
$('next').onclick = () => { stopSlide(); pos = (pos + 1) % (N * N); drawSlide(); };
$('play').onclick = () => {
  if (sliding) return stopSlide();
  $('play').textContent = t('Stop', 'Ferma');
  sliding = setInterval(() => { pos = (pos + 1) % (N * N); drawSlide(); }, 45);
};

// ------------------------------------------------------------------ controls
for (const k of ['c1', 'c2', 'lr', 'seed']) {
  $(k).value = S[k];
  $(k).onchange = e => { S[k] = +e.target.value; reset(); };
}
$('reset').onclick = reset;
// the saliency and the attack
$('salc').value = S.salc; $('salc').onchange = e => { S.salc = +e.target.value; save(); drawSaliency(); };
$('salx').checked = !!S.salx; $('salx').onchange = e => { S.salx = e.target.checked ? 1 : 0; save(); drawSaliency(); };
$('tgt').value = S.tgt; $('tgt').onchange = e => { S.tgt = +e.target.value; save(); };
$('iters').value = S.iters; $('iters').onchange = e => { S.iters = +e.target.value; save(); };
$('eps').value = S.eps; $('epsOut').textContent = S.eps.toFixed(2);
$('eps').oninput = e => { S.eps = +e.target.value; $('epsOut').textContent = S.eps.toFixed(2); save(); };
$('attack').onclick = attack;
$('useadv').onclick = () => { if (!adv) return; x = Float64Array.from(adv.xa); truth = null; adv = null; refresh(); };
$('step').onclick = () => { if (!data) return; stop(); step(); kick(); refresh(); };
$('train').onclick = () => running ? stop() : start();
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('select, input, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); $('train').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); $('step').click(); }
});
// a change of the theme on the site, or of the system, recolours the canvases
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { palette(); refresh(); });

// the texts of the language: the title, the buttons, the first option of the
// class and of the target
function words() {
  document.title = t('Convolution playground', 'Laboratorio della convoluzione');
  $('reset').textContent = t('Reset', 'Ricomincia'); $('step').textContent = t('Step', 'Passo');
  $('train').textContent = running ? t('Pause', 'Pausa') : t('Play', 'Avvia');
  $('clear').textContent = t('Clear', 'Cancella'); $('sample').textContent = t('Held-out digit', 'Cifra di test');
  $('next').textContent = t('Next position', 'Posizione successiva');
  $('play').textContent = sliding ? t('Stop', 'Ferma') : t('Slide', 'Scorri');
  $('attack').textContent = t('Attack', 'Attacca'); $('useadv').textContent = t('Use as input', 'Usa come ingresso');
  $('salc').options[0].textContent = t('predicted', 'predetta'); $('tgt').options[0].textContent = t('away', 'allontanarsi');
}
onLang(() => { words(); if (net) refresh(); });
words();
reset();
makeData(() => {
  x = Float64Array.from(test.X[3]); truth = test.Y[3]; adv = null;
  kick(); refresh();
});

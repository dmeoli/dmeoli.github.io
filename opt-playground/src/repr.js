// Scene M: how a network arranges the examples in the spaces of its layers,
// after C. Olah, "Visualizing MNIST: An Exploration of Dimensionality
// Reduction" (2014) and "Visualizing Representations: Deep Learning and Human
// Beings" (2015), https://colah.github.io/, and L. van der Maaten and G.
// Hinton, "Visualizing Data using t-SNE" (JMLR, 2008): the ideas rebuilt from
// their equations, no figure or code of theirs is used. A perceptron
// 400 -> h1 -> h2 -> 10 (src/repr-net.js) is trained with Adam on synthetic
// digits (src/convdata.js); at every epoch the activations of 500 held-out
// digits are taken in every layer, and their maps (src/repr-embed.js) follow:
// t-SNE warm-started from the previous layout, PCA from the previous axes, the
// probe from its previous weights, so that the picture moves continuously.
// All the work is done in slices, within a time budget per animation frame.

import { makeNet, trainBatch, forward, layerActivations } from './repr-net.js';
import { sqdist, distTo, condRows, symmetrize, TSNE, klDivergence, placeNew, mean, covRows, symFill, PCA, project, neighbours, knnAccuracy, Probe } from './repr-embed.js';
import { makeSet } from './convdata.js';
import { rng } from './nn.js';
import { N } from './convnet.js';
import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);
const S = { view: 'tsne', perp: 30, hid: '64-32', lr: 0.003, seed: 1, marks: 'dots' };
const CHOICES = { view: ['tsne', 'pca', 'probe'], hid: ['32-16', '64-32', '128-64'], marks: ['dots', 'digits'] };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => {
  if (k in CHOICES) { if (CHOICES[k].includes(v)) S[k] = v; }
  else if (k in S && Number.isFinite(+v)) S[k] = +v;
});
const NS = 500, NP = 1000, NTRAIN = 3000, B = 32, NB = Math.floor(NTRAIN / B), KNB = 8, KNN = 5;
let NAMES = [];
const names = () => { NAMES = t(['input', 'hidden 1', 'hidden 2', 'logits'], ['ingresso', 'nascosto 1', 'nascosto 2', 'logit']); };
names();
const TRAIN_MS = 9, FRAME_MS = 26, SETTLE = 60;   // t-SNE iterations on a snapshot before the next epoch

// ------------------------------------------------------------------ state
let sample = null, probeSet = { X: [], Y: [] }, train = { X: [], Y: [] };
const ready = () => probeSet.X.length >= NP;
let net, snapNet = null, epoch = 0, bi = 0, order = [], shuf = rng(1), losses = [];
let running = false, stepTo = null, job = null, again = false, netAcc = null, pred = null;
let layers = [];          // per layer: d, X, D, P, tsne, pca, pcaY, probe, knn, knn0, kl, box
let hover = { l: 3, i: 0 }, live = false, x = new Float64Array(N * N), inked = false, truth = null;
let dirty = true;

// the input layer is kept across a reset: its pixels, and so its maps, do not change
function freshLayers() {
  const keep = layers[0] && layers[0].P && layers[0].perp === S.perp ? layers[0] : null;
  layers = net.sizes.map((d, l) => l === 0 && keep ? keep
    : { d, X: null, D: null, P: null, tsne: null, pca: null, pcaY: null, knn: null, knn0: null, kl: null, perp: S.perp });
  for (const L of layers) { L.probe = new Probe(L.d, S.seed); L.pSteps = 0; L.box = null; if (L.Xp) L.probe.fit(L.Xp, NP); }
}

function reset() {
  running = false; stepTo = null;
  net = makeNet([N * N, ...S.hid.split('-').map(Number), 10], S.seed);
  epoch = 0; bi = 0; order = []; shuf = rng(S.seed + 1); losses = []; netAcc = null;
  freshLayers();
  job = null; again = false;
  if (ready()) schedule();
  refreshButtons(); save(); dirty = true;
}

function schedule() { if (job) again = true; else job = snapshot(); }

// ------------------------------------------------------------------ a snapshot of every layer
// a generator: each yield ends a slice of about a few million operations
function* snapshot() {
  const n = NS, ep = epoch, sn = { sizes: net.sizes, W: net.W.map(w => Float64Array.from(w)), b: net.b.map(v => Float64Array.from(v)) };
  const { acts, pred: pr } = layerActivations(sn, sample.X);
  let ok = 0; for (let i = 0; i < n; i++) if (pr[i] === sample.Y[i]) ok++;
  snapNet = sn; pred = pr; netAcc = ok / n; dirty = true;
  yield;
  const qa = layerActivations(sn, probeSet.X).acts;
  yield;
  for (let l = 0; l < layers.length; l++) {
    const L = layers[l], d = L.d, X = acts[l];
    if (l === 0 && L.P && L.perp === S.perp) continue;     // the pixels of the input never move
    const D = new Float64Array(n * n), Pc = new Float64Array(n * n);
    const rows = Math.max(1, Math.floor(3e6 / (n * d)));
    for (let i = 0; i < n; i += rows) { sqdist(X, n, d, D, i, Math.min(n, i + rows)); yield; }
    for (let i = 0; i < n; i += 40) { condRows(D, n, S.perp, Pc, i, Math.min(n, i + 40)); yield; }
    const P = symmetrize(Pc, n);
    const knn = knnAccuracy(D, n, sample.Y, KNN);
    yield;
    const m = mean(X, n, d), C = new Float64Array(d * d), crow = Math.max(1, Math.floor(3e6 / (d * d)));
    for (let i = 0; i < n; i += crow) { covRows(X, n, d, m, C, i, Math.min(n, i + crow)); yield; }
    symFill(C, d);
    let tr = 0; for (let k = 0; k < d; k++) tr += C[k * d + k];
    const pca = new PCA(C, d, L.pca && L.pca.V.length === 2 * d ? L.pca.V : null, S.seed);
    const its = Math.max(1, Math.floor(2e6 / (2 * d * d)));
    while (!pca.iterate(its)) yield;
    // the commit: from here on the maps and the neighbours are those of epoch ep
    L.X = X; L.D = D; L.P = P; L.knn = knn; L.perp = S.perp; L.epoch = ep;
    if (ep === 0 || L.knn0 === null) L.knn0 = knn;
    L.pca = { m, V: pca.V, lambda: pca.lambda, tr }; L.pcaY = project(X, n, d, m, pca.V);
    if (!L.tsne) {                                          // a first layout: PCA, shrunk
      let s = 0; for (const v of L.pcaY) s += v * v; s = Math.sqrt(s / (2 * n)) || 1;
      L.tsne = new TSNE(n, L.pcaY.map(v => 1e-4 * v / s)); L.fresh = true;
    } else { L.tsne.restart(); L.fresh = false; }
    L.Xp = qa[l]; L.probe.fit(L.Xp, NP); L.pSteps = 0; L.pAcc = NaN; L.kl = null;
    dirty = true;
    yield;
  }
}

// ------------------------------------------------------------------ the work of a frame
function settled() {
  if (job) return false;
  return layers.every((L, l) => l === 0 || (L.tsne && L.tsne.iter >= SETTLE));
}

function newOrder() {
  order = train.X.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(shuf() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
}

function trainSlice(t0) {
  if (!(running || stepTo !== null) || train.X.length < NTRAIN) return;
  while (performance.now() - t0 < TRAIN_MS) {
    if (bi === 0 && order.length === 0) newOrder();
    if (bi === NB) {                                        // the end of an epoch
      if (!settled()) return;                               // the maps catch up first
      epoch++; bi = 0; newOrder(); schedule();
      if (stepTo !== null && epoch >= stepTo) { stepTo = null; refreshButtons(); return; }
      if (!running && stepTo === null) return;
    }
    losses.push(trainBatch(net, train.X, train.Y, order.slice(bi * B, (bi + 1) * B), S.lr));
    if (losses.length > 40) losses.shift();
    bi++; dirty = true;
  }
}

const MAXIT = L => (L.fresh ? 1000 : 500);
function embedSlice(t1) {
  if (job) {
    while (performance.now() < t1) if (job.next().done) { job = null; if (again) { again = false; job = snapshot(); } break; }
  }
  // the t-SNE of every layer, one iteration at a time, in turn
  let any = true;
  while (any && performance.now() < t1) {
    any = false;
    for (const L of layers) {
      const T = L.tsne;
      if (!T || !L.P || T.iter >= MAXIT(L)) continue;
      const opts = L.fresh ? { exag: T.iter < 100 ? 12 : 1, mom: T.iter < 250 ? 0.5 : 0.8, lr: 100 } : { exag: 1, mom: T.iter < 20 ? 0.5 : 0.8, lr: 100 };
      T.step(L.P, opts); any = true; dirty = true;
      if (T.iter % 50 === 0 || T.iter === MAXIT(L)) L.kl = klDivergence(L.P, T.Y, NS);
      if (performance.now() >= t1) break;
    }
  }
  // the probes: a full-batch step on the 1000 digits of the probe set while
  // they still learn, and from time to time their accuracy on the 500
  if (S.view === 'probe') for (const L of layers) if (L.Xp && L.pSteps < 1500) {
    L.probe.steps(L.Xp, NP, probeSet.Y, 1); L.pSteps++; dirty = true;
    if (L.pSteps % 20 === 0 || isNaN(L.pAcc)) L.pAcc = L.probe.accuracy(L.X, NS, sample.Y);
  }
}

// the digits, a chunk of 250 per frame: the 500 held-out digits that are
// drawn, then the 1000 on which the probes are fitted, then the training set
function dataSlice() {
  if (!sample) {
    const a = makeSet(250, 2), b = makeSet(250, 3);
    sample = { X: [...a.X, ...b.X], Y: Int8Array.from([...a.Y, ...b.Y]) };
    x = Float64Array.from(sample.X[13]); inked = true; truth = sample.Y[13];
    dirty = true; return true;
  }
  if (!ready()) {
    const p = makeSet(250, 4 + probeSet.X.length / 250);
    probeSet.X.push(...p.X); probeSet.Y.push(...p.Y);
    if (ready()) { probeSet.Y = Int8Array.from(probeSet.Y); schedule(); }
    dirty = true; return true;
  }
  if (train.X.length < NTRAIN) {
    const p = makeSet(250, 100 + train.X.length / 250);
    train.X.push(...p.X); train.Y.push(...p.Y);
    if (train.X.length >= NTRAIN) { train.Y = Int8Array.from(train.Y); refreshButtons(); }
    dirty = true; return true;
  }
  return false;
}

function frame() {
  const t0 = performance.now();
  dataSlice();
  if (ready()) { trainSlice(t0); embedSlice(t0 + FRAME_MS); }
  if (dirty) { draw(); dirty = false; }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ colours
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
let P = null;
function palette() {
  const G = hex(css('--ground')), I = hex(css('--ink'));
  P = { ground: css('--ground'), panel: css('--panel'), rule: css('--rule'), ink: css('--ink'), soft: css('--ink-soft'),
    accent: css('--accent'), accent2: css('--accent-2'), gold: css('--gold'), lilac: css('--lilac'),
    cls: Array.from({ length: 10 }, (_, k) => css(`--c${k}`)),
    gray: Array.from({ length: 33 }, (_, k) => `rgb(${G.map((v, i) => Math.round(v + k / 32 * (I[i] - v))).join(',')})`) };
}

// ------------------------------------------------------------------ the maps
const maps = [];
function buildMaps() {
  const box = $('maps'); box.textContent = '';
  maps.length = 0;
  layers.forEach((L, l) => {
    const div = document.createElement('div'), h = document.createElement('h3'), o = document.createElement('output'), cv = document.createElement('canvas');
    h.textContent = `${NAMES[l]} · ${L.d}`; h.append(o);
    cv.width = cv.height = 400; cv.setAttribute('aria-label', t(`map of the ${NAMES[l]} layer`, `mappa dello strato ${NAMES[l]}`));
    div.append(h, cv); box.append(div);
    maps.push({ cv, o, scr: new Float64Array(2 * NS), view: null });
    cv.addEventListener('pointermove', e => pointAt(l, e));
    cv.addEventListener('pointerdown', e => pointAt(l, e));
    cv.addEventListener('pointerleave', () => { live = false; dirty = true; });
  });
}

function coords(l) {
  const L = layers[l];
  if (!L.X) return null;
  if (S.view === 'tsne') return L.tsne ? L.tsne.Y : null;
  if (S.view === 'pca') return L.pcaY;
  return L.probe.coords(L.X, NS);
}

// the point the reader drew, in every map
function drawnAt(l, Y) {
  if (!inked || !snapNet) return null;
  const L = layers[l], f = forward(snapNet, x), a = f.acts[l];
  if (S.view === 'tsne') return placeNew(distTo(L.X, NS, L.d, a), Y, S.perp);
  if (S.view === 'pca') { const p = project(a, 1, L.d, L.pca.m, L.pca.V); return [p[0], p[1]]; }
  return L.probe.z(a, 0, [0, 0]);
}

function drawMap(l, nb) {
  const M = maps[l], cv = M.cv, ctx = cv.getContext('2d'), W = cv.width, L = layers[l];
  ctx.fillStyle = P.panel; ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
  const Y = coords(l);
  M.o.textContent = L.knn === null ? '' : `5-NN ${(100 * L.knn).toFixed(1)}%`;
  if (!Y) { ctx.fillStyle = P.soft; ctx.font = '13px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(t('computing…', 'calcolo…'), W / 2, W / 2); return; }
  // an isotropic frame around the cloud (98% of the points), eased from frame to frame
  const xs = [], ys = [];
  for (let i = 0; i < NS; i++) { xs.push(Y[2 * i]); ys.push(Y[2 * i + 1]); }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = k => Math.floor(k * (NS - 1)), cx = (xs[q(0.01)] + xs[q(0.99)]) / 2, cy = (ys[q(0.01)] + ys[q(0.99)]) / 2;
  const r = Math.max(xs[q(0.99)] - xs[q(0.01)], ys[q(0.99)] - ys[q(0.01)], 1e-9) / 2 * 1.12;
  if (!L.box || M.view !== S.view) L.box = { cx, cy, r };
  else { const e = 0.2; L.box.cx += e * (cx - L.box.cx); L.box.cy += e * (cy - L.box.cy); L.box.r += e * (r - L.box.r); }
  M.view = S.view;
  const { cx: bx, cy: by, r: br } = L.box, s = (W / 2 - 10) / br, scr = M.scr;
  for (let i = 0; i < NS; i++) { scr[2 * i] = W / 2 + (Y[2 * i] - bx) * s; scr[2 * i + 1] = W / 2 - (Y[2 * i + 1] - by) * s; }
  const lit = new Set(nb), dim = live && nb.length;
  const dot = S.marks === 'dots';
  ctx.font = '500 13px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.5; ctx.strokeStyle = P.panel;
  for (let i = 0; i < NS; i++) {
    const c = sample.Y[i];
    ctx.globalAlpha = dim && !lit.has(i) && i !== hover.i ? 0.3 : 1;
    ctx.fillStyle = P.cls[c];
    if (dot) { ctx.beginPath(); ctx.arc(scr[2 * i], scr[2 * i + 1], 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
    else ctx.fillText(String(c), scr[2 * i], scr[2 * i + 1]);
  }
  ctx.globalAlpha = 1;
  // the hovered point and its neighbours (in the space where it was hovered)
  if (nb.length) {
    const hx = scr[2 * hover.i], hy = scr[2 * hover.i + 1];
    ctx.strokeStyle = P.soft; ctx.lineWidth = 1; ctx.globalAlpha = 0.7; ctx.beginPath();
    for (const j of nb) { ctx.moveTo(hx, hy); ctx.lineTo(scr[2 * j], scr[2 * j + 1]); }
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
    for (const j of nb) { ctx.beginPath(); ctx.arc(scr[2 * j], scr[2 * j + 1], 7, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.strokeStyle = P.ground; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(hx, hy, 10, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, hy, 10, 0, 2 * Math.PI); ctx.stroke();
  }
  // the drawn digit: a cross with a halo
  const p = drawnAt(l, Y);
  if (p) {
    const px = W / 2 + (p[0] - bx) * s, py = W / 2 - (p[1] - by) * s, k = 9;
    for (const [col, w] of [[P.ground, 6], [P.ink, 2.5]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      ctx.moveTo(px - k, py - k); ctx.lineTo(px + k, py + k); ctx.moveTo(px + k, py - k); ctx.lineTo(px - k, py + k); ctx.stroke();
    }
  }
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
}

function pointAt(l, e) {
  const M = maps[l], r = M.cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * M.cv.width, py = (e.clientY - r.top) / r.height * M.cv.height;
  if (!layers[l].X) return;
  let best = -1, bd = 16 * 16;
  for (let i = 0; i < NS; i++) { const d = (M.scr[2 * i] - px) ** 2 + (M.scr[2 * i + 1] - py) ** 2; if (d < bd) { bd = d; best = i; } }
  live = true;
  if (best >= 0 && (best !== hover.i || l !== hover.l)) hover = { l, i: best };
  dirty = true;
}

// ------------------------------------------------------------------ the digit images
function digitAt(ctx, img, x0, y0, side) {
  const c = side / N;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    ctx.fillStyle = P.gray[Math.round(32 * Math.min(1, Math.max(0, img[i * N + j])))];
    ctx.fillRect(x0 + j * c, y0 + i * c, Math.ceil(c), Math.ceil(c));
  }
}

function drawNeighbours(nb) {
  const cv = $('nb'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, W, H);
  if (!nb.length) return;
  const i = hover.i, big = 112, th = 50, gap = 8;
  digitAt(ctx, sample.X[i], 0, 18, big);
  ctx.strokeStyle = P.accent; ctx.lineWidth = 3; ctx.strokeRect(1.5, 19.5, big - 3, big - 3);
  ctx.font = '12px IBM Plex Mono, monospace'; ctx.fillStyle = P.soft;
  ctx.fillText(t(`a ${sample.Y[i]}, in ${NAMES[hover.l]}`, `un ${sample.Y[i]}, in ${NAMES[hover.l]}`), 0, 12);
  const x0 = big + 18;
  ctx.fillText(t('its 8 nearest neighbours', 'i suoi 8 vicini più prossimi'), x0, 12);
  nb.forEach((j, k) => {
    const cx = x0 + (k % 4) * (th + gap + 12), cy = 18 + Math.floor(k / 4) * (th + 22);
    digitAt(ctx, sample.X[j], cx, cy, th);
    ctx.fillStyle = P.cls[sample.Y[j]]; ctx.beginPath(); ctx.arc(cx + 5, cy + th + 11, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = sample.Y[j] === sample.Y[i] ? P.ink : P.soft; ctx.fillText(String(sample.Y[j]), cx + 14, cy + th + 15);
  });
  // the same count in every layer
  const yb = 18 + 2 * (th + 22) + 20;
  ctx.fillStyle = P.soft; ctx.fillText(t('same class among the 8 nearest:', 'stessa classe fra gli 8 più vicini:'), 0, yb);
  layers.forEach((L, l) => {
    if (!L.D) return;
    const c = neighbours(L.D, NS, i, KNB).filter(j => sample.Y[j] === sample.Y[i]).length;
    ctx.fillStyle = l === hover.l ? P.accent : P.ink;
    ctx.fillText(`${NAMES[l]} ${c}`, l * 130, yb + 20);
  });
}

function drawBars() {
  const cv = $('bars'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, top = 26, base = H - 34, left = 34;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, W, H);
  const y = v => base - v * (base - top), w = (W - left) / layers.length;
  ctx.font = '11px IBM Plex Mono, monospace'; ctx.fillStyle = P.soft; ctx.textAlign = 'end';
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) { ctx.beginPath(); ctx.moveTo(left, y(v) + 0.5); ctx.lineTo(W, y(v) + 0.5); ctx.stroke(); ctx.fillText(`${100 * v}`, left - 6, y(v) + 4); }
  ctx.textAlign = 'center';
  layers.forEach((L, l) => {
    const x0 = left + l * w + w * 0.2, bw = w * 0.6;
    if (L.knn !== null) {
      const h = base - y(L.knn), rr = Math.min(4, h);
      ctx.fillStyle = P.accent; ctx.beginPath(); ctx.roundRect(x0, y(L.knn), bw, h, [rr, rr, 0, 0]); ctx.fill();
      ctx.fillStyle = P.ink; ctx.fillText(`${(100 * L.knn).toFixed(1)}`, x0 + bw / 2, y(L.knn) - 5);
    }
    if (L.knn0 !== null) { ctx.strokeStyle = P.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 - 6, y(L.knn0)); ctx.lineTo(x0 + bw + 6, y(L.knn0)); ctx.stroke(); }
    ctx.fillStyle = P.soft; ctx.fillText(NAMES[l], x0 + bw / 2, H - 14);
  });
  if (netAcc !== null) {
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(left, y(netAcc)); ctx.lineTo(W, y(netAcc)); ctx.stroke(); ctx.setLineDash([]);
    const lab = t(`network itself ${(100 * netAcc).toFixed(1)}%`, `la rete stessa ${(100 * netAcc).toFixed(1)}%`);
    ctx.textAlign = 'end'; ctx.fillStyle = P.ink; ctx.fillText(lab, W - 2, 10);
    ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(W - 2 - ctx.measureText(lab).width - 34, 6); ctx.lineTo(W - 2 - ctx.measureText(lab).width - 8, 6); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.textAlign = 'start';
}

function drawPad() {
  const cv = $('pad'), ctx = cv.getContext('2d'), c = cv.width / N;
  digitAt(ctx, x, 0, 0, cv.width);
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
  for (let k = 1; k < N; k++) { ctx.beginPath(); ctx.moveTo(k * c, 0); ctx.lineTo(k * c, cv.height); ctx.moveTo(0, k * c); ctx.lineTo(cv.width, k * c); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (!snapNet || !inked) { $('padnote').textContent = inked ? '' : t('Draw a digit with the mouse or a finger.', 'Disegna una cifra con il mouse o con un dito.'); return; }
  const f = forward(snapNet, x);
  const top = [...f.prob.keys()].sort((a, b) => f.prob[b] - f.prob[a]).slice(0, 3);
  $('padnote').textContent = (truth === null ? '' : t(`A held-out ${truth}. `, `Un ${truth} tenuto da parte. `)) +
    t(`The network of epoch ${layers[1].epoch ?? 0} reads it as ${top[0]} (probability ${f.prob[top[0]].toFixed(2)}), then ${top[1]} (${f.prob[top[1]].toFixed(2)}) and ${top[2]} (${f.prob[top[2]].toFixed(2)}).`,
      `La rete dell'epoca ${layers[1].epoch ?? 0} la legge come ${top[0]} (probabilità ${f.prob[top[0]].toFixed(2)}), poi ${top[1]} (${f.prob[top[1]].toFixed(2)}) e ${top[2]} (${f.prob[top[2]].toFixed(2)}).`);
}

// ------------------------------------------------------------------ everything
function draw() {
  if (!P) palette();
  const L = layers[hover.l], nb = L && L.D ? neighbours(L.D, NS, hover.i, KNB) : [];
  if (maps.length !== layers.length) buildMaps();
  layers.forEach((_, l) => drawMap(l, nb));
  drawNeighbours(nb); drawBars(); drawPad();
  $('count').textContent = `${epoch}${bi && bi < NB ? '.' + String(Math.floor(100 * bi / NB)).padStart(2, '0') : ''}`;
  const T = layers[2] && layers[2].tsne, lossAvg = losses.length ? losses.reduce((s, v) => s + v, 0) / losses.length : null;
  const what = { tsne: 't-SNE', pca: 'PCA', probe: t('the linear probe', 'la sonda lineare') }[S.view];
  let msg;
  if (!sample) msg = t('Writing the digits…', 'Scrittura delle cifre…');
  else if (train.X.length < NTRAIN) msg = t(`Writing the training digits: ${train.X.length} of ${NTRAIN}; the maps of the untrained network are being computed.`,
    `Scrittura delle cifre di addestramento: ${train.X.length} su ${NTRAIN}; si calcolano le mappe della rete non addestrata.`);
  else {
    msg = t(`Epoch ${epoch}: the network classifies ${netAcc === null ? '…' : (100 * netAcc).toFixed(1) + '%'} of the 500 held-out digits`,
      `Epoca ${epoch}: la rete classifica ${netAcc === null ? '…' : (100 * netAcc).toFixed(1) + '%'} delle 500 cifre tenute da parte`) +
      (lossAvg === null ? '' : t(` (training loss ${lossAvg.toFixed(3)})`, ` (loss di addestramento ${lossAvg.toFixed(3)})`)) +
      t(`; the maps show the activations of epoch ${layers[1].epoch ?? 0}`, `; le mappe mostrano le attivazioni dell'epoca ${layers[1].epoch ?? 0}`);
    if (S.view === 'tsne' && T) msg += t(`, t-SNE at iteration ${T.iter}`, `, t-SNE all'iterazione ${T.iter}`) + (layers[2].kl === null ? '' : t(` with KL ${layers[2].kl.toFixed(3)} in hidden 2`, ` con KL ${layers[2].kl.toFixed(3)} in nascosto 2`));
    if (S.view === 'probe') msg += t(', the probe classifying in 2D ', ', la sonda che classifica in 2D ') + `${layers.map((L2, l) => `${NAMES[l]} ${!(L2.pAcc >= 0) ? '…' : (100 * L2.pAcc).toFixed(0) + '%'}`).join(', ')}` + t(' of the 500', ' dei 500');
    if (S.view === 'pca') msg += t(`, ${what} keeping ${layers.map(L2 => L2.pca ? (100 * (L2.pca.lambda[0] + L2.pca.lambda[1]) / L2.pca.tr).toFixed(0) + '%' : '…').join(', ')} of the variance`,
      `, con ${what} che conserva ${layers.map(L2 => L2.pca ? (100 * (L2.pca.lambda[0] + L2.pca.lambda[1]) / L2.pca.tr).toFixed(0) + '%' : '…').join(', ')} della varianza`);
    if (job) msg += t(' (the new snapshot is being computed)', ' (si calcola la nuova istantanea)');
    msg += '.';
  }
  $('explain').textContent = msg;
}

function refreshButtons() {
  const ok = train.X.length >= NTRAIN;
  $('step').disabled = $('train').disabled = !ok;
  $('train').textContent = running ? t('Pause', 'Pausa') : t('Play', 'Avvia');
}

function save() { history.replaceState(null, '', '#' + new URLSearchParams(S)); }

// ------------------------------------------------------------------ the reader's hand
let drawing = false, last = null;
function brush(gx, gy) {
  for (let i = Math.floor(gy - 2); i <= gy + 2; i++) for (let j = Math.floor(gx - 2); j <= gx + 2; j++) {
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const d = Math.hypot(i + 0.5 - gy, j + 0.5 - gx), v = Math.min(1, Math.max(0, (1.75 - d) / 0.8));
    if (v > x[i * N + j]) x[i * N + j] = v;
  }
}
function ink(e) {
  const cv = $('pad'), r = cv.getBoundingClientRect(), p = [(e.clientX - r.left) / r.width * N, (e.clientY - r.top) / r.height * N];
  if (last) { const n = Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1]) / 0.3); for (let t = 1; t <= n; t++) brush(last[0] + (p[0] - last[0]) * t / n, last[1] + (p[1] - last[1]) * t / n); }
  else brush(p[0], p[1]);
  last = p; inked = true; dirty = true;
}
$('pad').addEventListener('pointerdown', e => { drawing = true; last = null; truth = null; try { $('pad').setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ } ink(e); });
$('pad').addEventListener('pointermove', e => { if (drawing) ink(e); });
$('pad').addEventListener('pointerup', () => { drawing = false; });
$('pad').addEventListener('pointercancel', () => { drawing = false; });
$('clear').onclick = () => { x = new Float64Array(N * N); inked = false; truth = null; dirty = true; };
const pickR = rng(11);
$('sample').onclick = () => { if (!sample) return; const k = Math.floor(pickR() * NS); x = Float64Array.from(sample.X[k]); inked = true; truth = sample.Y[k]; hover = { l: hover.l, i: k }; dirty = true; };

// ------------------------------------------------------------------ controls
for (const k of ['view', 'perp', 'hid', 'lr', 'seed', 'marks']) {
  $(k).value = S[k];
  $(k).onchange = e => {
    const v = e.target.value; S[k] = k in CHOICES ? v : +v; save();
    if (k === 'view' || k === 'marks') { dirty = true; return; }
    if (k === 'perp') { for (const L of layers) L.perp = -1; if (ready()) schedule(); dirty = true; return; }
    if (k === 'hid') maps.length = 0;
    reset();
  };
}
$('reset').onclick = reset;
$('step').onclick = () => { if ($('step').disabled) return; running = false; stepTo = epoch + 1; refreshButtons(); };
$('train').onclick = () => { if ($('train').disabled) return; running = !running; stepTo = null; refreshButtons(); };
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('select, input, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); $('train').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); $('step').click(); }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { palette(); dirty = true; });

// the legend of the classes
for (let k = 0; k < 10; k++) { const li = document.createElement('li'), i = document.createElement('i'); i.style.background = `var(--c${k})`; li.append(i, String(k)); $('classes').append(li); }

// the texts that are not in the page twice: title, buttons, options
function labels() {
  document.title = t('Representations playground', 'Laboratorio delle rappresentazioni');
  $('step').textContent = t('Step', 'Passo');
  $('clear').textContent = t('Clear', 'Cancella');
  $('sample').textContent = t('Held-out digit', 'Cifra tenuta da parte');
  const O = { tsne: ['t-SNE', 't-SNE'], pca: ['PCA', 'PCA'], probe: ['linear probe', 'sonda lineare'], dots: ['dots', 'punti'], digits: ['numerals', 'numeri'] };
  for (const id of ['view', 'marks']) for (const o of $(id).options) o.textContent = t(...O[o.value]);
  refreshButtons();
}
onLang(() => { names(); labels(); maps.length = 0; dirty = true; });

labels();
reset();
requestAnimationFrame(frame);

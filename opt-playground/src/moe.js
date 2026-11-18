// Scene Q: a mixture of experts in the plane, in the frame of the TensorFlow
// Playground. K small experts and a softmax router are trained together with
// Adam (src/moe-model.js); the page draws the regions of the router, the
// output of the mixture and of every expert, the losses and the load of the
// experts over the epochs. The colours are the tokens of style.css and the
// --x0 ... --x7 of the page, read at every draw so that both themes work.

import { createModel, batch, epoch, effective, grid, makeData, DATA, cache, forward } from './moe-model.js';
import { rng } from './nn.js';
import { t as tx, onLang, onTheme } from './i18n.js';
import { texClear, texSet } from './tex.js';

const $ = id => document.getElementById(id);

// the presets: data sets on which the mixture has something to show
const PRESETS = {
  xor: { en: 'XOR, two linear experts', it: 'XOR, due esperti lineari', S: { data: 'xor', K: 2, expert: 'linear', router: 'linear', route: 'soft', bal: false } },
  planes: { en: 'Four planes', it: 'Quattro piani', S: { data: 'planes', K: 4, expert: 'linear', router: 'mlp', route: 'soft', bal: false } },
  regimes: { en: 'Two regimes', it: 'Due regimi', S: { data: 'regimes', K: 4, expert: 'mlp', router: 'linear', route: 'soft', bal: true, alpha: 0.1 } },
  checker: { en: 'Checkerboard, top-2', it: 'Scacchiera, top-2', S: { data: 'checker', K: 4, expert: 'mlp', router: 'mlp', route: '2', bal: true, alpha: 0.1 } },
  spiral: { en: 'Two spirals', it: 'Due spirali', S: { data: 'spiral', K: 4, expert: 'mlp', router: 'mlp', route: 'soft', bal: false } },
  collapse: { en: 'Collapse under top-1', it: 'Collasso con top-1', S: { data: 'circle', K: 8, expert: 'mlp', router: 'linear', route: '1', bal: false, alpha: 0.3 } },
};
const DATANAME = { xor: ['XOR', 'XOR'], checker: ['Checkerboard', 'Scacchiera'], spiral: ['Two spirals', 'Due spirali'], circle: ['Circle', 'Cerchio'],
                   planes: ['Four planes (regression)', 'Quattro piani (regressione)'], regimes: ['Two regimes (regression)', 'Due regimi (regressione)'] };

const DEF = { preset: 'xor', data: 'xor', K: 2, expert: 'linear', router: 'linear', route: 'soft', bal: false, alpha: 0.1, lr: 0.03, noise: 0, seed: 1 };
const S = { ...DEF };
const Q = new URLSearchParams(location.hash.slice(1));
Q.forEach((v, k) => {
  if (!(k in S)) return;
  S[k] = typeof DEF[k] === 'number' ? +v : typeof DEF[k] === 'boolean' ? v === '1' : v;
});
if (!DATA[S.data]) S.data = 'xor';
S.K = Math.max(2, Math.min(8, Math.round(S.K) || 2));
if (!['linear', 'mlp'].includes(S.expert)) S.expert = 'linear';
if (!['linear', 'mlp'].includes(S.router)) S.router = 'linear';
if (!['soft', '1', '2'].includes(S.route)) S.route = 'soft';
if (![0.01, 0.03, 0.1, 0.3, 1].includes(S.alpha)) S.alpha = 0.1;
if (![0.003, 0.01, 0.03, 0.1].includes(S.lr)) S.lr = 0.03;
if (!(S.preset in PRESETS)) S.preset = '';
// a link with a preset and nothing else (#preset=collapse) loads that preset
if (S.preset && !Q.has('data')) Object.assign(S, { alpha: 0.1 }, PRESETS[S.preset].S);

const kOf = () => (S.route === 'soft' ? 0 : +S.route);
const alphaOf = () => (S.bal ? S.alpha : 0);
const isClass = () => DATA[S.data].problem === 'classification';

let M, train, test, ep = 0, hist = [], playing = false, raf = 0, shuffle, G = null, probe = null;

function save() {
  const o = {};
  for (const k of Object.keys(DEF)) o[k] = typeof S[k] === 'boolean' ? (S[k] ? 1 : 0) : S[k];
  history.replaceState(null, '', '#' + new URLSearchParams(o));
}
function makeAll() {
  const pts = makeData(S.data, 500, S.noise / 100, S.seed);
  train = pts.slice(0, 350); test = pts.slice(350);
  M = createModel({ K: S.K, expert: S.expert, router: S.router, problem: DATA[S.data].problem, seed: S.seed });
  shuffle = rng(S.seed * 5 + 1);
  ep = 0; hist = []; measure();
}
function accuracy(pts) {
  const C = cache(M); let a = 0;
  for (const q of pts) { forward(M, q.u1, q.u2, kOf(), C); if ((C.y >= 0) === (q.label >= 0)) a++; }
  return a / pts.length;
}
function measure() {
  const tr = batch(M, train, kOf(), alphaOf(), false), te = batch(M, test, kOf(), 0, false);
  hist.push({ train: tr.mse, test: te.mse, aux: tr.aux, f: Array.from(tr.f), acc: isClass() ? accuracy(test) : null });
}
function stepOnce() { epoch(M, train, kOf(), alphaOf(), S.lr, 20, shuffle); ep++; measure(); }
function reset() { stop(); makeAll(); save(); buildExperts(); draw(); }

function stop() { playing = false; cancelAnimationFrame(raf); $('play').textContent = tx('Play', 'Avvia'); }
function play() {
  if (playing) return stop();
  playing = true; $('play').textContent = tx('Pause', 'Pausa');
  const frame = () => {
    if (!playing) return;
    const t0 = performance.now();
    do stepOnce(); while (performance.now() - t0 < 16);
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ colours
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + Math.max(0, Math.min(1, t)) * (b[i] - v));
const rgb = c => `rgb(${c.map(Math.round).join(',')})`;
function pal() {
  const p = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) p[k] = hex(css('--' + k));
  p.x = Array.from({ length: 8 }, (_, i) => hex(css('--x' + i)));
  return p;
}
// a value in [-1, 1]: gold for negative, the ground at zero, violet for positive
const heat = (P, v) => (v >= 0 ? mix(P.ground, P.accent, v) : mix(P.ground, P.gold, -v));

// an n x n field drawn on the whole canvas through a smoothed bitmap
function paint(ctx, n, W, H, colour) {
  const img = new ImageData(n, n);
  for (let q = 0; q < n * n; q++) { const c = colour(q); img.data[4 * q] = c[0]; img.data[4 * q + 1] = c[1]; img.data[4 * q + 2] = c[2]; img.data[4 * q + 3] = 255; }
  const off = document.createElement('canvas'); off.width = off.height = n; off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, H);
}
// the level line F = lev by marching squares, F given at the centres of the cells
function contour(ctx, F, n, W, lev = 0) {
  const s = W / n, P = (x, y) => [(x + 0.5) * s, (y + 0.5) * s];
  ctx.beginPath();
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = F[j * n + i] - lev, b = F[j * n + i + 1] - lev, c = F[(j + 1) * n + i + 1] - lev, d = F[(j + 1) * n + i] - lev, pts = [];
    if ((a > 0) !== (b > 0)) pts.push(P(i + a / (a - b), j));
    if ((b > 0) !== (c > 0)) pts.push(P(i + 1, j + b / (b - c)));
    if ((d > 0) !== (c > 0)) pts.push(P(i + d / (d - c), j + 1));
    if ((a > 0) !== (d > 0)) pts.push(P(i, j + a / (a - d)));
    for (let k = 0; k + 1 < pts.length; k += 2) { ctx.moveTo(...pts[k]); ctx.lineTo(...pts[k + 1]); }
  }
  ctx.stroke();
}
function points(ctx, P, pts, W) {
  for (const q of pts) {
    ctx.beginPath(); ctx.arc((q.x + 6) / 12 * W, (6 - q.y) / 12 * W, W > 300 ? 3.2 : 2.4, 0, 7);
    ctx.fillStyle = rgb(heat(P, Math.max(-1, Math.min(1, q.label)))); ctx.strokeStyle = rgb(P.ink); ctx.lineWidth = 0.8;
    ctx.fill(); ctx.stroke();
  }
}

// ------------------------------------------------------------------ drawings
const N = 80;   // the grid of the maps, smoothed when drawn
function drawRouter(P) {
  const cv = $('regions'), ctx = cv.getContext('2d'), W = cv.width, K = M.K;
  paint(ctx, N, W, W, q => {
    const conf = (G.pmax[q] - 1 / K) / (1 - 1 / K);
    return mix(P.ground, P.x[G.top[q]], 0.18 + 0.5 * conf);
  });
  // the borders of the regions, in the colour of the ground
  ctx.strokeStyle = rgb(P.ground); ctx.lineWidth = 1.5;
  for (let e = 0; e < K; e++) {
    contour(ctx, G.D.subarray(e * N * N, (e + 1) * N * N), N, W);
  }
  points(ctx, P, train, W);
  ctx.strokeStyle = rgb(P.ink); ctx.lineWidth = 2.5;
  if (isClass()) contour(ctx, G.y, N, W, 0);
  else { ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]); for (const l of [-0.6, -0.3, 0, 0.3, 0.6]) contour(ctx, G.y, N, W, l); ctx.setLineDash([]); }
  // the numbers of the experts at the centres of their regions
  const cx = new Float64Array(K), cy = new Float64Array(K), cn = new Float64Array(K);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const e = G.top[j * N + i]; cx[e] += i; cy[e] += j; cn[e]++; }
  ctx.font = '500 15px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let e = 0; e < K; e++) if (cn[e] > N * N * 0.01) {
    const X = (cx[e] / cn[e] + 0.5) * W / N, Y = (cy[e] / cn[e] + 0.5) * W / N;
    ctx.fillStyle = rgb(P.ground); ctx.beginPath(); ctx.arc(X, Y, 12, 0, 7); ctx.fill();
    ctx.strokeStyle = rgb(P.x[e]); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = rgb(P.ink); ctx.fillText(String(e + 1), X, Y + 1);
  }
  if (probe) {
    ctx.strokeStyle = rgb(P.ink); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc((probe.x + 6) / 12 * W, (6 - probe.y) / 12 * W, 7, 0, 7); ctx.stroke();
  }
}
function drawMix(P) {
  const cv = $('mix'), ctx = cv.getContext('2d'), W = cv.width;
  paint(ctx, N, W, W, q => heat(P, Math.max(-1, Math.min(1, G.y[q]))));
  points(ctx, P, train, W);
}
function buildExperts() {
  const box = $('experts'); box.replaceChildren();
  for (let e = 0; e < S.K; e++) {
    const f = document.createElement('figure'); f.className = 'expert';
    const c = document.createElement('canvas'); c.width = c.height = 180;
    f.append(c, document.createElement('p'));
    box.append(f);
  }
}
function drawExperts(P) {
  const figs = $('experts').children, K = M.K, nn = N * N, f = hist.at(-1).f;
  for (let e = 0; e < K; e++) {
    const fig = figs[e], cv = fig.firstChild, ctx = cv.getContext('2d'), W = cv.width;
    paint(ctx, N, W, W, q => {
      const v = Math.max(-1, Math.min(1, G.E[e * nn + q])), gq = G.G[e * nn + q];
      return mix(P.ground, heat(P, v), 0.1 + 0.9 * gq);
    });
    ctx.strokeStyle = rgb(P.x[e]); ctx.lineWidth = 2; ctx.setLineDash([4, 3]); contour(ctx, G.D.subarray(e * nn, (e + 1) * nn), N, W); ctx.setLineDash([]);
    cv.style.borderColor = rgb(P.x[e]);
    fig.lastChild.innerHTML = `<i style="background:${rgb(P.x[e])}"></i>${e + 1} · ${tx('load', 'carico')} <b>${(100 * f[e]).toFixed(0)}%</b>`;
  }
}
function axes(ctx, W, H, P) {
  ctx.strokeStyle = rgb(P.rule); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, 4); ctx.lineTo(30, H - 14); ctx.lineTo(W - 4, H - 14); ctx.stroke();
}
function drawLoss(P) {
  const cv = $('loss'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H); axes(ctx, W, H, P);
  const vals = hist.flatMap(h => [h.train, h.test, ...(h.aux ? [h.aux] : [])]).filter(v => v > 0);
  const lo = Math.log10(Math.max(1e-4, Math.min(...vals))), hi = Math.log10(Math.max(...vals) * 1.05);
  const top = Math.ceil(hi), bot = Math.min(Math.floor(lo), top - 1), n = Math.max(50, hist.length - 1);
  const X = e => 30 + e / n * (W - 34), Y = v => 4 + (top - Math.log10(Math.max(v, 1e-6))) / (top - bot) * (H - 18);
  ctx.fillStyle = rgb(P['ink-soft']); ctx.font = '10px IBM Plex Mono, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let d = bot; d <= top; d++) {
    ctx.fillText(d === 0 ? '1' : `1e${d}`, 27, Y(10 ** d));
    ctx.strokeStyle = rgb(mix(P.ground, P.rule, 0.6)); ctx.beginPath(); ctx.moveTo(31, Y(10 ** d)); ctx.lineTo(W - 4, Y(10 ** d)); ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(hist.length - 1), W - 14, H - 2); ctx.fillText('0', 32, H - 2);
  const line = (key, col, dash) => {
    ctx.strokeStyle = rgb(col); ctx.setLineDash(dash); ctx.lineWidth = 1.8; ctx.beginPath();
    hist.forEach((h, e) => { const y = Y(h[key]); e ? ctx.lineTo(X(e), y) : ctx.moveTo(X(e), y); });
    ctx.stroke(); ctx.setLineDash([]);
  };
  line('train', P.accent, []); line('test', P.accent, [4, 3]);
  if (hist.some(h => h.aux)) line('aux', P.gold, []);
}
function drawLoadNow(P) {
  const cv = $('loadnow'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, K = M.K, f = hist.at(-1).f;
  ctx.clearRect(0, 0, W, H);
  const top = Math.max(0.5, ...f) * 1.12, bw = (W - 8) / K, Y = v => H - 16 - v / top * (H - 30);
  ctx.font = '10px IBM Plex Mono, monospace'; ctx.textAlign = 'center';
  ctx.strokeStyle = rgb(P.ink); ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(4, Y(1 / K)); ctx.lineTo(W - 4, Y(1 / K)); ctx.stroke(); ctx.setLineDash([]);
  for (let e = 0; e < K; e++) {
    ctx.fillStyle = rgb(P.x[e]); ctx.fillRect(4 + e * bw + 3, Y(f[e]), bw - 6, H - 16 - Y(f[e]));
    ctx.fillStyle = rgb(P['ink-soft']); ctx.fillText(String(e + 1), 4 + (e + 0.5) * bw, H - 4);
    ctx.fillStyle = rgb(P.ink); ctx.lineWidth = 3; ctx.strokeStyle = rgb(P.ground); ctx.lineJoin = 'round';
    ctx.strokeText(`${(100 * f[e]).toFixed(0)}`, 4 + (e + 0.5) * bw, Y(f[e]) - 3); ctx.fillText(`${(100 * f[e]).toFixed(0)}`, 4 + (e + 0.5) * bw, Y(f[e]) - 3);
  }
  ctx.strokeStyle = rgb(P.rule); ctx.beginPath(); ctx.moveTo(4, H - 16); ctx.lineTo(W - 4, H - 16); ctx.stroke();
}
function drawLoadHist(P) {
  const cv = $('loadhist'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, K = M.K;
  ctx.clearRect(0, 0, W, H);
  const n = Math.max(50, hist.length), cw = (W - 8) / n, h0 = H - 14;
  for (let e = 0; e < hist.length; e++) {
    let y = h0;
    for (let i = 0; i < K; i++) {
      const hgt = hist[e].f[i] * (h0 - 2);
      ctx.fillStyle = rgb(P.x[i]); ctx.fillRect(4 + e * cw, y - hgt, Math.max(1, cw + 0.4), hgt); y -= hgt;
    }
  }
  ctx.fillStyle = rgb(P['ink-soft']); ctx.font = '10px IBM Plex Mono, monospace'; ctx.textAlign = 'left';
  ctx.fillText(tx('epoch 0', 'epoca 0'), 4, H - 2); ctx.textAlign = 'right'; ctx.fillText(String(Math.max(0, hist.length - 1)), W - 4, H - 2);
}
function report() {
  const h = hist.at(-1), f = h.f, K = M.K, eff = effective(f), big = f.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const used = f.filter(v => v >= 0.05).length, pc = v => `${(100 * v).toFixed(0)}%`;
  const lead = tx(`Epoch ${ep}: test loss ${h.test.toFixed(4)}${h.acc !== null ? `, test accuracy ${pc(h.acc)}` : ''}. `,
                  `Epoca ${ep}: loss di test ${h.test.toFixed(4)}${h.acc !== null ? `, accuratezza di test ${pc(h.acc)}` : ''}. `);
  const load = tx(`The router sends the largest share of the training points, ${pc(big[0][0])}, to expert ${big[0][1] + 1}; ${used} of the ${K} experts receive at least 5% of them, and the effective number of experts \\(e^{H(f)}\\) is ${eff.toFixed(2)} of ${K}.`,
                  `Il router manda la quota più grande dei punti di addestramento, ${pc(big[0][0])}, all'esperto ${big[0][1] + 1}; ${used} dei ${K} esperti ne ricevono almeno il 5%, e il numero effettivo di esperti \\(e^{H(f)}\\) è ${eff.toFixed(2)} su ${K}.`);
  const el = $('rep'), s = lead + load;
  if (el.dataset.s === s) return;
  texClear(el); el.textContent = s; el.dataset.s = s; texSet(el);
}
function drawProbe() {
  if (!probe) { $('probe').textContent = tx('Point at the map to read the gates of the router there.', 'Passa col puntatore sulla mappa per leggervi i gate del router.'); return; }
  const C = cache(M); forward(M, probe.x / 6, probe.y / 6, kOf(), C);
  const gs = Array.from(C.g).map((g, i) => `${i + 1}: ${g.toFixed(2)}`).join('  ');
  $('probe').innerHTML = `(${probe.x.toFixed(1)}, ${probe.y.toFixed(1)}) · g = ${gs} · y = <b>${C.y.toFixed(2)}</b>`;
}
function draw() {
  const P = pal();
  G = grid(M, kOf(), N);
  drawRouter(P); drawMix(P); drawExperts(P); drawLoss(P); drawLoadNow(P); drawLoadHist(P); drawProbe();
  const h = hist.at(-1);
  $('epoch').textContent = String(ep).padStart(5, '0');
  $('trainLoss').textContent = h.train.toFixed(4); $('testLoss').textContent = h.test.toFixed(4);
  $('accBox').hidden = !isClass(); if (isClass()) $('acc').textContent = `${(100 * h.acc).toFixed(1)}%`;
  report();
  for (const e of document.querySelectorAll('.eq')) e.classList.toggle('lit', e.dataset.part === (S.route === 'soft' ? 'soft' : S.route) || (e.dataset.part === 'bal' && S.bal));
}

// ------------------------------------------------------------------ controls
function thumbs() {
  const P = pal(), box = $('datas'); box.replaceChildren();
  for (const k of Object.keys(DATA)) {
    const b = document.createElement('button'); b.type = 'button'; b.title = tx(...DATANAME[k]);
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', k === S.data);
    const c = document.createElement('canvas'); c.width = c.height = 64; b.append(c);
    const ctx = c.getContext('2d'); ctx.fillStyle = rgb(P.ground); ctx.fillRect(0, 0, 64, 64);
    for (const q of makeData(k, 200, 0, 5)) {
      ctx.fillStyle = rgb(heat(P, Math.max(-1, Math.min(1, q.label)))); ctx.beginPath(); ctx.arc((q.x + 6) / 12 * 64, (6 - q.y) / 12 * 64, 1.8, 0, 7); ctx.fill();
    }
    b.onclick = () => { S.data = k; S.preset = ''; syncControls(); reset(); };
    box.append(b);
  }
}
function syncControls() {
  $('preset').value = S.preset; $('K').value = S.K; $('expert').value = S.expert; $('router').value = S.router; $('route').value = S.route;
  $('bal').checked = S.bal; $('alpha').value = String(S.alpha); $('alpha').disabled = !S.bal; $('lr').value = String(S.lr);
  $('noise').value = S.noise; $('noiseOut').textContent = S.noise;
  for (const b of $('datas').children) b.setAttribute('aria-checked', b.title === tx(...DATANAME[S.data]));
}
const custom = () => { S.preset = ''; $('preset').value = ''; };
$('preset').onchange = e => { const p = PRESETS[e.target.value]; S.preset = e.target.value; if (p) Object.assign(S, { alpha: 0.1 }, p.S); syncControls(); reset(); };
$('K').onchange = e => { S.K = +e.target.value; custom(); reset(); };
$('expert').onchange = e => { S.expert = e.target.value; custom(); reset(); };
$('router').onchange = e => { S.router = e.target.value; custom(); reset(); };
// the routing, the balancing loss and the learning rate change the training, not the model
$('route').onchange = e => { S.route = e.target.value; custom(); save(); measureKeep(); draw(); };
$('bal').onchange = e => { S.bal = e.target.checked; $('alpha').disabled = !S.bal; custom(); save(); measureKeep(); draw(); };
$('alpha').onchange = e => { S.alpha = +e.target.value; custom(); save(); };
$('lr').onchange = e => { S.lr = +e.target.value; save(); };
$('noise').oninput = e => { S.noise = +e.target.value; $('noiseOut').textContent = S.noise; custom(); reset(); };
$('regen').onclick = () => { S.seed = 1 + Math.floor(Math.random() * 1e5); reset(); };
$('reset').onclick = reset;
$('step').onclick = () => { stop(); stepOnce(); draw(); };
$('play').onclick = play;
// a change of routing in the middle of a run: the last point of the curves is measured again
function measureKeep() { hist.pop(); measure(); }
const cvR = $('regions');
cvR.onmousemove = e => {
  const r = cvR.getBoundingClientRect();
  probe = { x: -6 + 12 * (e.clientX - r.left) / r.width, y: 6 - 12 * (e.clientY - r.top) / r.height };
  if (!playing) draw(); else drawProbe();
};
cvR.onmouseleave = () => { probe = null; if (!playing) draw(); };
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
  if (e.key === 'ArrowRight' && t.type !== 'range') { stop(); stepOnce(); draw(); }
  if (e.key === ' ') { e.preventDefault(); play(); }
});

// the texts that the page cannot hold twice
function words() {
  document.title = tx('Mixture of Experts', 'Mixture of experts');
  const O = {
    expert: { linear: ['linear', 'lineare'], mlp: ['MLP, 4 tanh units', 'MLP, 4 unità tanh'] },
    router: { linear: ['linear', 'lineare'], mlp: ['MLP, 8 tanh units', 'MLP, 8 unità tanh'] },
    route: { soft: ['soft', 'soft'], 2: ['top-2', 'top-2'], 1: ['top-1 (Switch)', 'top-1 (Switch)'] },
  };
  for (const [id, o] of Object.entries(O)) for (const op of $(id).options) op.textContent = tx(...o[op.value]);
  const ps = $('preset'); ps.replaceChildren(new Option(tx('custom', 'personalizzato'), ''));
  for (const [k, p] of Object.entries(PRESETS)) ps.append(new Option(tx(p.en, p.it), k));
  ps.value = S.preset;
  $('datas').setAttribute('aria-label', tx('data set', 'insieme di dati'));
  $('play').textContent = playing ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
  $('step').textContent = tx('Step', 'Passo'); $('reset').textContent = tx('Reset', 'Ricomincia');
  thumbs();
}
onLang(() => { words(); syncControls(); delete $('rep').dataset.s; draw(); });
onTheme(() => { thumbs(); syncControls(); draw(); });
words(); syncControls();
reset();

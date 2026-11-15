// Scene Q: spiking networks. One leaky integrate-and-fire neuron, live, with
// its f-I curve against a ReLU; the step of the spike and the surrogate of its
// derivative; a small spiking network trained in the page by backpropagation
// through time with the surrogate gradient and Adam (src/spiking-net.js), on
// points of the plane coded as spike trains, with the decision regions, the
// raster of a chosen point, the loss and the firing rate. The colours are the
// tokens of style.css, read at every drawing.

import { rate, gauss, rng, S as fast, dS, encode, forward, createRun, D } from './spiking-net.js';
import { t as tx, onLang, onTheme, bi } from './i18n.js';
import { texClear, texSet } from './tex.js';

const $ = id => document.getElementById(id);
const DEF = { data: 'circle', code: 'rate', T: 50, H: 16, read: 'count', lam: 0, lr: 0.01, seed: 1, k: 5,
  beta: 0.9, theta: 1, I: 0.25, sigma: 0.1, px: NaN, py: NaN };
const S = { ...DEF };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });
const pick = (k, list) => { if (!list.includes(S[k])) S[k] = DEF[k]; };
pick('data', ['circle', 'xor', 'gauss', 'spiral']); pick('code', ['rate', 'regular', 'latency']); pick('T', [25, 50, 100]);
pick('H', [8, 16, 32]); pick('read', ['count', 'membrane']); pick('lam', [0, 0.3, 1, 3]); pick('lr', [0.003, 0.01, 0.03]); pick('seed', [1, 2, 3, 4, 5]);
const clampS = (k, a, b) => { if (!(S[k] >= a && S[k] <= b)) S[k] = DEF[k]; };
clampS('k', 0.5, 20); clampS('beta', 0.5, 0.99); clampS('theta', 0.2, 2); clampS('I', 0, 1.5); clampS('sigma', 0, 0.5);

// ------------------------------------------------------------------ drawing kit
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function rgb(c) {
  if (c[0] === '#') {
    if (c.length === 4) c = '#' + [...c.slice(1)].map(x => x + x).join('');
    return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  }
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
}
const mix = (a, b, s) => `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * s)).join(',')})`;
const col = a => mix(a, a, 0);
let P = null;
function palette() {
  P = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) P[k] = rgb(css('--' + k));
}
const MONO = "'IBM Plex Mono', monospace";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fit(cv, h, wmax) {
  const w = Math.max(220, Math.round(Math.min(wmax || 1e9, cv.parentNode.clientWidth || 500)));
  const d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  cv.style.height = h + 'px'; cv.style.width = w + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.fillStyle = col(P.panel); ctx.fillRect(0, 0, w, h);
  return { ctx, W: w };
}
function ticks(a, b, n) {
  const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))), m = [1, 2, 5, 10].find(k => (b - a) / (k * st) <= n) * st, out = [];
  for (let v = Math.ceil(a / m - 1e-9) * m; v <= b + 1e-9; v += m) out.push(+v.toFixed(6));
  return out;
}
// a frame with grid lines at the ticks, labels at the left and at the bottom
function axes(ctx, box, X, Y, xt, yt, xl, yl) {
  const [x0, y0, x1, y1] = box;
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1; ctx.fillStyle = col(P['ink-soft']); ctx.font = `10px ${MONO}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of yt) { const y = Y(v); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.fillText(String(v), x0 - 4, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of xt) { const x = X(v); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.fillText(String(v), x, y1 + 4); }
  ctx.textAlign = 'right'; ctx.fillText(xl, x1, y1 + 16);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(yl, x0, y0 - 4);
}
function curve(ctx, xs, ys, X, Y, c, w = 2, dash = []) {
  ctx.strokeStyle = c; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath();
  xs.forEach((x, i) => (i ? ctx.lineTo(X(x), Y(ys[i])) : ctx.moveTo(X(x), Y(ys[i])))); ctx.stroke(); ctx.setLineDash([]);
}
// a legend of HTML items, with MathJax in the labels: [[colour token, kind, en, it]]
function key(el, items) {
  const html = items.map(([c, k, en, it]) => `<li style="color:var(--${c})"><i class="${k}"></i><span style="color:var(--ink-soft)">${bi(en, it)}</span></li>`).join('');
  if (el.dataset.html === html) return;
  texClear(el); el.innerHTML = html; el.dataset.html = html; texSet(el);
}

// ------------------------------------------------------------------ the neuron, live
const N = 220;                       // the steps on the screen
const scope = { I: new Float64Array(N), v: new Float64Array(N), s: new Uint8Array(N), head: 0, n: 0, vv: 0, ss: 0, g: gauss(rng(99)) };
function scopeStep() {
  const I = S.I + S.sigma * scope.g();
  scope.vv = S.beta * scope.vv + I - S.theta * scope.ss; scope.ss = scope.vv >= S.theta ? 1 : 0;
  const h = scope.head; scope.I[h] = I; scope.v[h] = scope.vv; scope.s[h] = scope.ss;
  scope.head = (h + 1) % N; scope.n = Math.min(N, scope.n + 1);
}
function drawScope() {
  const cv = $('scope'), { ctx, W } = fit(cv, 250), x0 = 34, x1 = W - 10, n = scope.n;
  const at = k => (scope.head - n + k + N) % N, X = k => x0 + k / (N - 1) * (x1 - x0);
  let iLo = 0, iHi = 0.5, vLo = -0.25 * S.theta, vHi = 1.3 * S.theta;
  for (let k = 0; k < n; k++) { const q = at(k); iLo = Math.min(iLo, scope.I[q]); iHi = Math.max(iHi, scope.I[q]); vLo = Math.min(vLo, scope.v[q]); vHi = Math.max(vHi, scope.v[q]); }
  const bands = [[8, 62], [74, 196], [208, 232]];
  const Yi = v => bands[0][1] - (v - iLo) / (iHi - iLo) * (bands[0][1] - bands[0][0]);
  const Yv = v => bands[1][1] - (v - vLo) / (vHi - vLo) * (bands[1][1] - bands[1][0]);
  ctx.font = `11px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const [b, lab] of [[bands[0], 'I'], [bands[1], 'v'], [bands[2], 's']]) {
    ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, b[0] + 0.5, x1 - x0 - 1, b[1] - b[0] - 1);
    ctx.fillStyle = col(P['ink-soft']); ctx.fillText(lab, x0 - 8, (b[0] + b[1]) / 2);
  }
  // the zero of I and of v, the threshold, I/(1 - beta)
  ctx.strokeStyle = col(P.rule); ctx.beginPath(); ctx.moveTo(x0, Yi(0)); ctx.lineTo(x1, Yi(0)); ctx.moveTo(x0, Yv(0)); ctx.lineTo(x1, Yv(0)); ctx.stroke();
  ctx.strokeStyle = col(P.gold); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, Yv(S.theta)); ctx.lineTo(x1, Yv(S.theta)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = col(P.gold); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('θ', x0 + 4, Yv(S.theta) - 2);
  const vinf = S.I / (1 - S.beta);
  if (vinf < vHi) {
    ctx.strokeStyle = col(P['ink-soft']); ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, Yv(vinf)); ctx.lineTo(x1, Yv(vinf)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col(P['ink-soft']); ctx.textAlign = 'right'; ctx.fillText('I/(1−β)', x1 - 4, Yv(vinf) - 2);
  }
  if (!n) return;
  const path = (Y, arr, c, w) => {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
    for (let k = 0; k < n; k++) { const q = at(k); k ? ctx.lineTo(X(k), Y(arr[q])) : ctx.moveTo(X(k), Y(arr[q])); }
    ctx.stroke();
  };
  path(Yi, scope.I, col(P['accent-2']), 1.2);
  path(Yv, scope.v, col(P.accent), 1.8);
  let c = 0;
  ctx.strokeStyle = col(P.ink); ctx.lineWidth = 1.5;
  for (let k = 0; k < n; k++) if (scope.s[at(k)]) {
    c++;
    ctx.beginPath(); ctx.moveTo(X(k), bands[2][0] + 3); ctx.lineTo(X(k), bands[2][1] - 3); ctx.stroke();
    // the spike drawn up from the potential, as on an oscilloscope
    ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(X(k), Yv(scope.v[at(k)])); ctx.lineTo(X(k), bands[1][0]); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = col(P['ink-soft']); ctx.font = `10px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(tx(`${c} spikes in the last ${n} steps`, `${c} impulsi negli ultimi ${n} passi`), x1, bands[2][1] + 4);
  ctx.textAlign = 'left'; ctx.fillText(tx('step →', 'passo →'), x0, bands[2][1] + 4);
}

// the f-I curve, computed again when beta, theta or sigma change
let fiCache = null;
function drawFI() {
  const cv = $('fi'), { ctx, W } = fit(cv, 250), box = [40, 20, W - 12, 210], Imax = 1.5;
  const id = `${S.beta},${S.theta},${S.sigma}`;
  if (!fiCache || fiCache.id !== id) {
    const Is = [], r = [];
    for (let q = 0; q <= 150; q++) { const I = q / 150 * Imax; Is.push(I); r.push(rate(I, S.beta, S.theta, S.sigma, 1500)); }
    fiCache = { id, Is, r };
  }
  const X = I => box[0] + I / Imax * (box[2] - box[0]), Y = r => box[3] - r / 1.05 * (box[3] - box[1]);
  axes(ctx, box, X, Y, ticks(0, Imax, 6), [0, 0.25, 0.5, 0.75, 1], tx('input I', 'ingresso I'), tx('rate (spikes per step)', 'tasso (impulsi per passo)'));
  const relu = fiCache.Is.map(I => clamp((I - (1 - S.beta) * S.theta) / S.theta, 0, 1));
  curve(ctx, fiCache.Is, relu, X, Y, col(P.gold), 1.5, [5, 4]);
  curve(ctx, fiCache.Is, fiCache.r, X, Y, col(P.accent), 2.2);
  // the input of the neuron on the left, with the rate it gives
  const r0 = rate(S.I, S.beta, S.theta, S.sigma, 1500);
  ctx.fillStyle = col(P.ink); ctx.strokeStyle = col(P.panel); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(X(S.I), Y(r0), 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  const rh = (1 - S.beta) * S.theta;
  if (rh < Imax) {
    ctx.fillStyle = col(P['ink-soft']); ctx.font = `10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('(1−β)θ', X(rh) + 3, box[3] - 3);
  }
  key($('fikey'), [['accent', '', 'LIF neuron', 'neurone LIF'], ['gold', 'dash', 'ReLU \\(\\max(0, I - (1-\\beta)\\theta)/\\theta\\)', 'ReLU \\(\\max(0, I - (1-\\beta)\\theta)/\\theta\\)'],
    ['ink', 'dot', `\\(I = ${S.I.toFixed(2)}\\): ${r0.toFixed(3)} spikes per step`, `\\(I = ${S.I.toFixed(2)}\\): ${r0.toFixed(3)} impulsi per passo`]]);
}

// the step, the fast sigmoid, its derivative and the histogram of v - theta
function drawSurr() {
  const cv = $('surr'), { ctx, W } = fit(cv, 230), box = [40, 20, W - 40, 196], u0 = -2, u1 = 1;
  const X = u => box[0] + (u - u0) / (u1 - u0) * (box[2] - box[0]), Y = v => box[3] - v / 1.08 * (box[3] - box[1]);
  axes(ctx, box, X, Y, ticks(u0, u1, 6), [0, 0.5, 1], 'u = v − θ', '');
  const h = run && run.vhist;
  if (h) {
    const m = Math.max(...h, 1), bw = (box[2] - box[0]) / h.length;
    ctx.fillStyle = col(P.lilac);
    h.forEach((c, b) => { const y = Y(0.9 * c / m); ctx.fillRect(box[0] + b * bw + 0.5, y, bw - 1, box[3] - y); });
  }
  const us = []; for (let q = 0; q <= 300; q++) us.push(u0 + q / 300 * (u1 - u0));
  const pk = S.k / 2;
  curve(ctx, us, us.map(u => (u >= 0 ? 1 : 0)), X, Y, col(P['ink-soft']), 1.5);
  curve(ctx, us, us.map(u => fast(u, S.k)), X, Y, col(P['accent-2']), 1.5, [5, 4]);
  curve(ctx, us, us.map(u => dS(u, S.k) / pk), X, Y, col(P.accent), 2.4);
  // the right axis, for the derivative
  ctx.fillStyle = col(P.accent); ctx.font = `10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('0', box[2] + 4, Y(0)); ctx.fillText(pk.toFixed(pk < 1 ? 2 : 1), box[2] + 4, Y(1));
  ctx.textBaseline = 'bottom'; ctx.textAlign = 'right'; ctx.fillText("H̃′", W - 4, box[1] - 4);
  key($('surrkey'), [['ink-soft', '', '\\(H(u)\\)', '\\(H(u)\\)'], ['accent-2', 'dash', '\\(\\tilde H(u)\\)', '\\(\\tilde H(u)\\)'],
    ['accent', '', "\\(\\tilde H'(u)\\), right axis", "\\(\\tilde H'(u)\\), asse destro"], ['lilac', 'box', '\\(v_t - \\theta\\), hidden', '\\(v_t - \\theta\\), nascosti']]);
}

// ------------------------------------------------------------------ the network
let run = null, playing = false;
const opts = () => run.opts();
function reset() {
  stop();
  run = createRun({ data: S.data, code: S.code, read: S.read, T: S.T, H: S.H, lam: S.lam, lr: S.lr, k: S.k, seed: S.seed });
  if (!Number.isFinite(S.px)) { S.px = +run.test[0].x.toFixed(2); S.py = +run.test[0].y.toFixed(2); }
  run.measure(); save(); drawNet(); drawSurr();
}

// the map: one forward per cell, the Poisson coding drawn from a seed per cell
const G = 44;
function drawPlane() {
  const cv = $('plane'), side = Math.min(420, cv.parentNode.clientWidth || 400), { ctx, W } = fit(cv, side, side), o = opts();
  const off = drawPlane.off || (drawPlane.off = document.createElement('canvas'));
  off.width = G; off.height = G;
  const oc = off.getContext('2d'), img = oc.createImageData(G, G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const x = -6 + 12 * (gx + 0.5) / G, y = 6 - 12 * (gy + 0.5) / G;
    const F = forward(run.net, encode(x, y, S.code, S.T, rng(1 + gx + G * gy)), S.T, o);
    const p = F.P[1] - F.P[0], c = p >= 0 ? P.accent : P.gold, a = 0.75 * Math.abs(p), q = 4 * (gy * G + gx);
    for (let m = 0; m < 3; m++) img.data[q + m] = Math.round(P.ground[m] + (c[m] - P.ground[m]) * a);
    img.data[q + 3] = 255;
  }
  oc.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = S.code !== 'rate'; ctx.drawImage(off, 0, 0, W, W);
  const X = x => (x + 6) / 12 * W, Y = y => (6 - y) / 12 * W;
  ctx.strokeStyle = col(P.ground); ctx.lineWidth = 1;
  for (const q of run.train) {
    ctx.fillStyle = col(q.c ? P.accent : P.gold);
    ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), 3, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  ctx.strokeStyle = col(P.ink); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(X(S.px), Y(S.py), 7, 0, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(S.px) - 11, Y(S.py)); ctx.lineTo(X(S.px) - 4, Y(S.py)); ctx.moveTo(X(S.px) + 4, Y(S.py)); ctx.lineTo(X(S.px) + 11, Y(S.py)); ctx.stroke();
}

function drawRaster() {
  const o = opts(), T = S.T, H = S.H, Xin = encode(S.px, S.py, S.code, T, rng(777)), F = forward(run.net, Xin, T, o);
  const net = run.net, mem = S.read === 'membrane';
  const order = [...Array(H).keys()].sort((a, b) => (net.p[net.W2 + H + b] - net.p[net.W2 + b]) - (net.p[net.W2 + H + a] - net.p[net.W2 + a]));
  const rh = H > 16 ? 5 : 7, gap = 8, left = 46, top = 6;
  const yIn = top, yHid = yIn + D * rh + gap, yOut = yHid + H * rh + gap, outH = mem ? 70 : 2 * 9;
  const height = yOut + outH + 22, cv = $('raster'), { ctx, W } = fit(cv, height), cw = (W - left - 8) / T;
  const cell = (t, y, h, c) => { ctx.fillStyle = c; ctx.fillRect(left + t * cw + 0.5, y + 0.5, Math.max(1, cw - 1), h - 1); };
  // the frames of the three groups
  ctx.font = `10px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = col(P['ink-soft']);
  const fr = (y, h, lab) => { ctx.fillStyle = col(P.ground); ctx.fillRect(left, y, T * cw, h); ctx.fillStyle = col(P['ink-soft']); ctx.fillText(lab, left - 6, y + h / 2); };
  fr(yIn, D * rh, tx('in', 'ing.')); fr(yHid, H * rh, tx('hid.', 'nasc.')); fr(yOut, outH, tx('out', 'usc.'));
  for (let t = 0; t < T; t++) for (let c = 0; c < D; c++) if (Xin[t * D + c]) cell(t, yIn + c * rh, rh, col(P.gold));
  let fired = 0;
  order.forEach((i, r) => {
    let any = 0; for (let t = 0; t < T; t++) any += F.s[t * H + i];
    if (any) fired++;
    if (!any) { ctx.fillStyle = col(P.rule); ctx.fillRect(left, yHid + r * rh + rh / 2 - 0.5, T * cw, 1); }
    for (let t = 0; t < T; t++) if (F.s[t * H + i]) cell(t, yHid + r * rh, rh, col(P.accent));
  });
  if (mem) {
    let lo = 0, hi = 0.1;
    for (let q = 0; q < F.w.length; q++) { lo = Math.min(lo, F.w[q]); hi = Math.max(hi, F.w[q]); }
    const Y = v => yOut + outH - 4 - (v - lo) / (hi - lo) * (outH - 8);
    ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(left + T * cw, Y(0)); ctx.stroke();
    for (const [j, c] of [[0, P.gold], [1, P.accent]]) {
      ctx.strokeStyle = col(c); ctx.lineWidth = 1.8; ctx.beginPath();
      for (let t = 0; t < T; t++) { const x = left + (t + 0.5) * cw, y = Y(F.w[t * 2 + j]); t ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
  } else for (let t = 0; t < T; t++) for (const [j, c] of [[0, P.gold], [1, P.accent]]) if (F.z[t * 2 + j]) cell(t, yOut + j * 9, 9, col(c));
  ctx.fillStyle = col(P['ink-soft']); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of ticks(1, T, 5).filter(Number.isInteger)) ctx.fillText(String(t), left + (t - 0.5) * cw, yOut + outH + 4);
  ctx.textAlign = 'right'; ctx.fillText(tx('step', 'passo'), left - 6, yOut + outH + 4);
  const cls = F.P[1] > F.P[0], nsp = F.s.reduce((a, b) => a + b, 0), nin = Xin.reduce((a, b) => a + b, 0);
  const lg = [...F.logit].map(v => (mem ? v.toFixed(2) : String(v)));
  setNote($('rasnote'), tx(
    `point (${S.px.toFixed(1)}, ${S.py.toFixed(1)}): <b>${nin}</b> input spikes, <b>${nsp}</b> hidden spikes from ${fired} of ${H} neurons; ` +
      `outputs ${mem ? 'mean potential' : 'spike count'} <b>${lg[0]}</b> gold, <b>${lg[1]}</b> violet, so <b>${cls ? 'violet' : 'gold'}</b> with probability ${Math.max(...F.P).toFixed(2)}`,
    `punto (${S.px.toFixed(1)}, ${S.py.toFixed(1)}): <b>${nin}</b> impulsi d'ingresso, <b>${nsp}</b> impulsi nascosti da ${fired} neuroni su ${H}; ` +
      `uscite ${mem ? 'potenziale medio' : 'conteggio degli impulsi'} <b>${lg[0]}</b> oro, <b>${lg[1]}</b> viola, quindi <b>${cls ? 'viola' : 'oro'}</b> con probabilità ${Math.max(...F.P).toFixed(2)}`));
}
function setNote(el, html) { if (el.innerHTML !== html) el.innerHTML = html; }

function drawCurves() {
  const hs = run.hist, xmax = Math.max(20, run.epoch), ep = hs.map(h => h.epoch);
  {
    const cv = $('loss'), { ctx, W } = fit(cv, 220), box = [40, 22, W - 12, 184];
    const ymax = Math.max(1, ...hs.map(h => Math.min(h.loss, 3)));
    const X = e => box[0] + e / xmax * (box[2] - box[0]), Y = v => box[3] - Math.min(v, ymax) / ymax * (box[3] - box[1]);
    axes(ctx, box, X, Y, ticks(0, xmax, 5), ticks(0, ymax, 4), tx('epoch', 'epoca'), '');
    curve(ctx, ep, hs.map(h => h.acc), X, Y, col(P.gold), 1.8, [5, 3]);
    curve(ctx, ep, hs.map(h => h.loss), X, Y, col(P.accent), 2.2);
    legend(ctx, box[2] - 150, box[1] + 10, [[col(P.accent), tx('test loss', 'loss di test')], [col(P.gold), tx('test accuracy', 'accuratezza di test'), [5, 3]]]);
  }
  {
    const cv = $('rate'), { ctx, W } = fit(cv, 220), box = [40, 22, W - 12, 184];
    const ymax = Math.max(0.2, ...hs.map(h => Math.max(h.rate, h.silent))) * 1.05;
    const X = e => box[0] + e / xmax * (box[2] - box[0]), Y = v => box[3] - v / ymax * (box[3] - box[1]);
    axes(ctx, box, X, Y, ticks(0, xmax, 5), ticks(0, ymax, 4), tx('epoch', 'epoca'), '');
    curve(ctx, ep, hs.map(h => h.silent), X, Y, col(P.gold), 1.8, [5, 3]);
    curve(ctx, ep, hs.map(h => h.rate), X, Y, col(P.accent), 2.2);
    legend(ctx, box[2] - 190, box[1] + 10, [[col(P.accent), tx('mean rate (spikes/step)', 'tasso medio (impulsi/passo)')], [col(P.gold), tx('share of silent neurons', 'quota di neuroni silenti'), [5, 3]]]);
  }
}
function legend(ctx, x, y, items) {
  ctx.font = `11px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const w = 30 + Math.max(...items.map(([, s]) => ctx.measureText(s).width));
  x = Math.min(x, ctx.canvas.width / (window.devicePixelRatio || 1) - w - 8);
  ctx.globalAlpha = 0.85; ctx.fillStyle = col(P.panel); ctx.fillRect(x - 4, y - 9, w, 15 * items.length + 3); ctx.globalAlpha = 1;
  items.forEach(([c, s, dash], k) => {
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(x, y + 15 * k); ctx.lineTo(x + 16, y + 15 * k); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col(P.ink); ctx.fillText(s, x + 22, y + 15 * k);
  });
}

const CODE_IT = { rate: 'codifica di frequenza di Poisson', regular: 'codifica di frequenza regolare', latency: 'codifica di latenza' };
const CODE_EN = { rate: 'Poisson rate coding', regular: 'regular rate coding', latency: 'latency coding' };
function report() {
  const h = run.hist.at(-1), pct = v => `${(100 * v).toFixed(0)}%`;
  $('rep').textContent = tx(
    `After ${run.epoch} epochs, with ${CODE_EN[S.code]} over ${S.T} steps, the network classifies ${pct(h.acc)} of the test points right (loss ${h.loss.toFixed(3)}); ` +
      `its hidden neurons fire ${h.rate.toFixed(3)} spikes per neuron per step, about ${(h.rate * S.T * S.H).toFixed(0)} spikes per point, and ${pct(h.silent)} of them never fire.`,
    `Dopo ${run.epoch} epoche, con la ${CODE_IT[S.code]} su ${S.T} passi, la rete classifica correttamente il ${pct(h.acc)} dei punti di test (loss ${h.loss.toFixed(3)}); ` +
      `i suoi neuroni nascosti emettono ${h.rate.toFixed(3)} impulsi per neurone per passo, circa ${(h.rate * S.T * S.H).toFixed(0)} impulsi per punto, e il ${pct(h.silent)} di essi non spara mai.`);
  $('epoch').textContent = run.epoch;
}
function drawNet() { drawPlane(); drawRaster(); drawCurves(); report(); }

// ------------------------------------------------------------------ transport
function stop() { playing = false; $('play').textContent = tx('Play', 'Avvia'); }
function stepOnce() { run.trainEpoch(); run.measure(); drawNet(); drawSurr(); }
function frame() {
  if (!playing) return;
  const t0 = performance.now();
  do run.trainEpoch(); while (performance.now() - t0 < 20);
  run.measure(); drawNet(); drawSurr();
  requestAnimationFrame(frame);
}
function play() {
  if (playing) return stop();
  playing = true; $('play').textContent = tx('Pause', 'Pausa'); requestAnimationFrame(frame);
}

// the neuron runs on its own, one step per frame, while it is on the screen
let visible = true;
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe($('scope'));
let last = 0;
function scopeLoop(ts) {
  if (visible && ts - last > 30) { last = ts; scopeStep(); drawScope(); }
  requestAnimationFrame(scopeLoop);
}

function save() {
  const o = {}; for (const k of Object.keys(DEF)) o[k] = S[k];
  history.replaceState(null, '', '#' + new URLSearchParams(o));
}

// ------------------------------------------------------------------ controls
for (const k of ['data', 'code', 'read']) { $(k).value = S[k]; $(k).onchange = e => { S[k] = e.target.value; reset(); }; }
for (const k of ['T', 'H', 'seed']) { $(k).value = String(S[k]); $(k).onchange = e => { S[k] = +e.target.value; reset(); }; }
for (const k of ['lam', 'lr']) {
  $(k).value = String(S[k]);
  $(k).onchange = e => { S[k] = run[k] = +e.target.value; save(); };
}
const KNOBS = { beta: 2, theta: 2, I: 2, sigma: 2, k: 1 };
for (const [k, d] of Object.entries(KNOBS)) {
  $(k).value = S[k]; $(k + 'v').textContent = S[k].toFixed(d);
  $(k).oninput = e => {
    S[k] = +e.target.value; $(k + 'v').textContent = S[k].toFixed(d); save();
    if (k === 'k') { run.k = S.k; drawSurr(); } else drawFI();
  };
}
$('reset').onclick = reset;
$('step').onclick = () => { stop(); stepOnce(); };
$('play').onclick = play;
$('plane').onclick = e => {
  const r = $('plane').getBoundingClientRect();
  S.px = +(-6 + 12 * (e.clientX - r.left) / r.width).toFixed(2); S.py = +(6 - 12 * (e.clientY - r.top) / r.height).toFixed(2);
  save(); drawPlane(); drawRaster();
};
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); stop(); stepOnce(); }
  if (e.key === ' ') { e.preventDefault(); play(); }
});

const OPTS = {
  data: { circle: ['circle', 'cerchio'], xor: ['exclusive or', 'or esclusivo'], gauss: ['two gaussians', 'due gaussiane'], spiral: ['spiral', 'spirale'] },
  code: { rate: ['rate, Poisson', 'frequenza, Poisson'], regular: ['rate, regular', 'frequenza, regolare'], latency: ['latency', 'latenza'] },
  read: { count: ['spike count', 'conteggio degli impulsi'], membrane: ['membrane', 'membrana'] },
};
function words() {
  document.title = tx('Spiking Networks', 'Reti a impulsi');
  for (const [id, o] of Object.entries(OPTS)) for (const op of $(id).options) op.textContent = tx(...o[op.value]);
  $('reset').textContent = 'Reset'; $('step').textContent = tx('Step', 'Passo');
  $('play').textContent = playing ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
}
function redrawAll() { palette(); drawScope(); drawFI(); drawSurr(); if (run) drawNet(); }
onLang(() => { words(); redrawAll(); });
onTheme(redrawAll);
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(redrawAll, 100); });

palette(); words();
for (let q = 0; q < N; q++) scopeStep();
reset(); drawFI(); drawScope();
requestAnimationFrame(scopeLoop);

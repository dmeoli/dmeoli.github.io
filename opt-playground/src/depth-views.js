// The drawings of scene O, on canvases sized to their box: the decision map
// with the data, the loss curves, the histograms of the activations and of the
// weight gradients layer by layer, and the strip of the first unit of every
// layer over the plane. The colours are the tokens of style.css, read at every
// drawing so that both themes work.

import { t as tr } from './i18n.js';

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function rgb(c) {
  if (c[0] === '#') {
    if (c.length === 4) c = '#' + [...c.slice(1)].map(x => x + x).join('');
    return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  }
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
}
function palette() {
  const P = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) P[k] = rgb(css('--' + k));
  return P;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mixA = (a, b, s) => a.map((x, k) => Math.round(x + (b[k] - x) * s));
const str = c => `rgb(${c.join(',')})`;
// a value in [-1, 1]: violet positive, gold negative, the ground at zero
const signed = (P, v) => mixA(P.ground, v >= 0 ? P.accent : P.gold, clamp(Math.abs(v), 0, 1));
const MONO = "'IBM Plex Mono', monospace";

function fit(cv, h, minW = 200) {
  const w = Math.max(minW, Math.round(cv.getBoundingClientRect().width || cv.parentNode.clientWidth || 400));
  const d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  const P = palette();
  ctx.fillStyle = str(P.ground); ctx.fillRect(0, 0, w, h);
  return { ctx, W: w, P };
}
// a G x G field of values in [-1, 1] drawn into the box (x, y, s, s)
function field(ctx, P, vals, G, x, y, s) {
  const off = document.createElement('canvas'); off.width = off.height = G;
  const oc = off.getContext('2d'), img = oc.createImageData(G, G);
  for (let q = 0; q < G * G; q++) img.data.set([...signed(P, isFinite(vals[q]) ? vals[q] : 0), 255], q * 4);
  oc.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(off, x, y, s, s);
}

// the probability of the positive class over the plane, as 2p - 1, with the
// training points (filled) and the test points (hollow)
export function drawMap(cv, { o, G, train, test }) {
  const { ctx, W, P } = fit(cv, Math.round(cv.getBoundingClientRect().width || 320), 160);
  const v = Array.from(o, t => 2 / (1 + Math.exp(-t)) - 1);
  field(ctx, P, v, G, 0, 0, W);
  const dot = (p, hollow) => {
    const X = (p.x + 6) / 12 * W, Y = (6 - p.y) / 12 * W, c = p.label > 0 ? P.accent : P.gold;
    ctx.beginPath(); ctx.arc(X, Y, 3, 0, 7);
    if (hollow) { ctx.strokeStyle = str(c); ctx.lineWidth = 1.5; ctx.stroke(); }
    else { ctx.fillStyle = str(c); ctx.fill(); ctx.strokeStyle = str(P.ground); ctx.lineWidth = 1; ctx.stroke(); }
  };
  for (const p of train) dot(p, false);
  for (const p of test) dot(p, true);
}

// the training loss (solid) and the test loss (dashed), with the loss of the
// constant answer log 2 dotted
export function drawLoss(cv, hist) {
  const H = 110, { ctx, W, P } = fit(cv, H), L = 34, R = 8, T = 8, Bm = 18;
  const vals = hist.flatMap(h => [h.loss, h.testLoss]).filter(isFinite);
  const hi = Math.min(4, Math.max(1, ...vals)), n = Math.max(20, hist.at(-1).epoch);
  const X = e => L + e / n * (W - L - R), Y = v => T + (1 - clamp(v, 0, hi) / hi) * (H - T - Bm);
  ctx.strokeStyle = str(P.rule); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - Bm); ctx.lineTo(W - R, H - Bm); ctx.stroke();
  ctx.fillStyle = str(P['ink-soft']); ctx.font = `10px ${MONO}`; ctx.textAlign = 'right';
  ctx.fillText(hi.toFixed(1), L - 4, T + 8); ctx.fillText('0', L - 4, H - Bm);
  ctx.textAlign = 'left'; ctx.fillText(`${tr('epoch', 'epoca')} ${hist.at(-1).epoch}`, L + 4, H - 4);
  ctx.setLineDash([1, 3]); ctx.strokeStyle = str(P['ink-soft']);
  ctx.beginPath(); ctx.moveTo(L, Y(Math.LN2)); ctx.lineTo(W - R, Y(Math.LN2)); ctx.stroke();
  for (const [k, dash] of [['loss', []], ['testLoss', [4, 3]]]) {
    ctx.setLineDash(dash); ctx.strokeStyle = str(P.accent); ctx.lineWidth = 2; ctx.beginPath();
    hist.forEach((h, i) => { const x = X(h.epoch), y = Y(isFinite(h[k]) ? h[k] : hi); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// a round number at least v: 1, 2 or 5 times a power of 10
export function nice(v) {
  if (!(v > 0) || !isFinite(v)) return 1;
  const e = Math.floor(Math.log10(v)), m = v / 10 ** e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * 10 ** e;
}
export const GLO = -20, GHI = 4;   // the decades of the gradient histograms
const fmtE = v => (v === 0 ? '0' : `1e${v}`);

// one row per layer: the histogram of its activations h_l on the training set
// over [-R, R] (or [0, R]), and that of log10 |dL/dW_l| over the decades
// GLO..GHI, with an ink tick at the norm of the whole gradient of W_l; values
// beyond the ends fall in the end bins, which are drawn darker
export function drawLayers(cv, { acts, grads, gnorm, R, lo }) {
  const d = acts.length, rowH = clamp(Math.floor(460 / d), 13, 24), top = 30, H = top + d * rowH + 6;
  const { ctx, W, P } = fit(cv, H, 280), lab = 24, gap = 14, pw = (W - lab - gap) / 2, NB = 40;
  const x0 = lab, x1 = lab + pw + gap;
  ctx.font = `10px ${MONO}`; ctx.fillStyle = str(P['ink-soft']);
  ctx.textAlign = 'left'; ctx.fillText(tr('activations h_l', 'attivazioni h_l'), x0, 10); ctx.fillText('log10 |∂L/∂W_l|', x1, 10);
  const ticksA = lo === 0 ? [0, R / 2, R] : [-R, 0, R], fmt = v => (Math.abs(v) >= 1e4 || (v && Math.abs(v) < 1e-2) ? v.toExponential(0) : String(+v.toPrecision(2)));
  // the end ticks are aligned inwards, so that the two panels do not overlap
  const tick = (s, x, at) => { ctx.textAlign = at === 0 ? 'left' : at === 1 ? 'right' : 'center'; ctx.fillText(s, x, 24); };
  ticksA.forEach((t, i) => tick(fmt(t), x0 + (t - lo) / (R - lo) * pw, i / 2));
  for (let t = GLO; t <= GHI; t += pw < 220 ? 8 : 4) tick(fmtE(t), x1 + (t - GLO) / (GHI - GLO) * pw, (t - GLO) / (GHI - GLO));
  const bins = (vals, a, b, f) => {
    const c = new Float64Array(NB);
    for (const v of vals) { const t = f(v); if (!isFinite(t)) continue; c[clamp(Math.floor((t - a) / (b - a) * NB), 0, NB - 1)]++; }
    return c;
  };
  const bar = (c, x, y, col) => {
    const m = Math.max(...c) || 1, bw = pw / NB;
    c.forEach((k, i) => {
      if (!k) return;
      const h = Math.max(1, (rowH - 3) * k / m);
      ctx.fillStyle = str(i === 0 || i === NB - 1 ? mixA(col, P.ink, 0.35) : col);
      ctx.fillRect(x + i * bw, y + rowH - 2 - h, Math.max(1, bw - 0.5), h);
    });
  };
  for (let l = 0; l < d; l++) {
    const y = top + l * rowH;
    ctx.fillStyle = str(l % 2 ? P.ground : P.panel); ctx.fillRect(0, y, W, rowH);
    ctx.fillStyle = str(P['ink-soft']); ctx.textAlign = 'right'; ctx.fillText(String(l + 1), lab - 6, y + rowH - 4);
    bar(bins(acts[l], lo, R, v => v), x0, y, P.accent);
    bar(bins(grads[l], GLO, GHI, v => Math.log10(Math.abs(v))), x1, y, P.gold);
    const t = Math.log10(gnorm[l]);
    if (isFinite(t)) {
      const x = x1 + clamp((t - GLO) / (GHI - GLO), 0, 1) * pw;
      ctx.fillStyle = str(P.ink); ctx.fillRect(x - 1, y + 1, 2, rowH - 2);
    }
  }
  ctx.strokeStyle = str(P.rule); ctx.lineWidth = 1;
  for (const x of [x0, x1]) { ctx.strokeRect(x + 0.5, top + 0.5, pw - 1, d * rowH - 1); }
}

// the first unit of every layer over the plane, on the scale [-R, R] of the
// histograms, so that a unit whose signal has vanished is the colour of zero
export function drawStrip(cv, { units, G, R, shift }) {
  const d = units.length, cvW = Math.round(cv.getBoundingClientRect().width || 600);
  // at least 40 px a map, the maps of a row filling the width, at most 80 px
  const per = Math.min(d, Math.max(1, Math.floor((cvW + 6) / 46)));
  const s = Math.min(80, Math.floor((cvW + 6) / per) - 6), rows = Math.ceil(d / per), lh = 14;
  const { ctx, P } = fit(cv, rows * (s + lh + 6), 200);
  ctx.font = `10px ${MONO}`; ctx.textAlign = 'left';
  units.forEach((u, l) => {
    const x = (l % per) * (s + 6), y = Math.floor(l / per) * (s + lh + 6);
    ctx.fillStyle = str(P['ink-soft']); ctx.fillText(String(l + 1), x, y + 10);
    field(ctx, P, Array.from(u, v => (v - shift) / R), G, x, y + lh, s);
  });
}

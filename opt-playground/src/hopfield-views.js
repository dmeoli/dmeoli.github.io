// The drawings of the Hopfield scene on canvases sized to their box: the state
// of the network, the glyphs that can be stored, the overlaps (or the weights
// of the softmax), the energy along the updates and the measured recall rates.
// The colours are the tokens of style.css, read at every drawing.

import { t as tx } from './i18n.js';
import { SIDE } from './hopfield-model.js';

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
function palette() {
  const P = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) P[k] = rgb(css('--' + k));
  return P;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MONO = "'IBM Plex Mono', monospace";

function fit(cv, h, wMax = Infinity) {
  const w = Math.min(wMax, Math.max(200, Math.round(cv.parentNode.clientWidth || 400)));
  const H = typeof h === 'function' ? h(w) : h, d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(w * d); cv.height = Math.round(H * d); }
  cv.style.width = w + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  const P = palette();
  ctx.clearRect(0, 0, w, H);
  return { ctx, W: w, H, P };
}
// the colour of a pixel of value v in [-1, 1]: ground for -1, accent for +1
const pix = (P, v) => mix(P.panel, P.accent, clamp((v + 1) / 2, 0, 1));

// ------------------------------------------------------------------ the state
// o = { s, hot (neuron just updated or -1), flipped }; returns the cell size
export function drawState(cv, o) {
  const { ctx, W, P } = fit(cv, w => w, 340);
  const c = W / SIDE;
  for (let r = 0; r < SIDE; r++) for (let q = 0; q < SIDE; q++) {
    ctx.fillStyle = pix(P, o.s[r * SIDE + q]);
    ctx.fillRect(q * c, r * c, c + 0.5, c + 0.5);
  }
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 0.6;
  for (let k = 1; k < SIDE; k++) {
    ctx.beginPath(); ctx.moveTo(k * c, 0); ctx.lineTo(k * c, W); ctx.moveTo(0, k * c); ctx.lineTo(W, k * c); ctx.stroke();
  }
  if (o.hot >= 0) {
    const r = Math.floor(o.hot / SIDE), q = o.hot % SIDE;
    ctx.strokeStyle = col(P.gold); ctx.lineWidth = o.flipped ? 4 : 2;
    ctx.strokeRect(q * c + 1.5, r * c + 1.5, c - 3, c - 3);
  }
  return c;
}

// --------------------------------------------------------------- the glyphs
// o = { keys, glyphs, stored (Set), cue }; returns the boxes for the clicks
export function drawGlyphs(cv, o) {
  const n = o.keys.length, per = 12, rows = Math.ceil(n / per);
  const { ctx, W, P } = fit(cv, w => Math.round(rows * (w / per)));
  const b = W / per, pad = Math.max(2, b * 0.09), c = (b - 2 * pad) / SIDE, hits = [];
  o.keys.forEach((k, m) => {
    const x0 = (m % per) * b, y0 = Math.floor(m / per) * b, on = o.stored.has(k), g = o.glyphs[k];
    for (let i = 0; i < SIDE * SIDE; i++) {
      if (g[i] < 0) continue;
      ctx.fillStyle = on ? col(P.accent) : mix(P.ground, P['ink-soft'], 0.35);
      ctx.fillRect(x0 + pad + (i % SIDE) * c, y0 + pad + Math.floor(i / SIDE) * c, c + 0.3, c + 0.3);
    }
    ctx.strokeStyle = on ? col(P.accent) : col(P.rule); ctx.lineWidth = on ? 1.5 : 1;
    ctx.strokeRect(x0 + 1, y0 + 1, b - 2, b - 2);
    if (k === o.cue) { ctx.strokeStyle = col(P.gold); ctx.lineWidth = 2.5; ctx.strokeRect(x0 + 2, y0 + 2, b - 4, b - 4); }
    hits.push({ x: x0, y: y0, w: b, h: b, key: k });
  });
  return hits;
}

// ------------------------------------------------- overlaps or softmax weights
// o = { keys, values, signed (overlaps in [-1, 1]) or not (weights in [0, 1]), cue }
export function drawBars(cv, o) {
  const { ctx, W, H, P } = fit(cv, 150);
  const n = o.keys.length, L = 34, R = 8, T = 10, B = 22, w = (W - L - R) / Math.max(n, 1);
  const y = v => o.signed ? T + (1 - v) / 2 * (H - T - B) : T + (1 - v) * (H - T - B);
  ctx.font = `11px ${MONO}`; ctx.fillStyle = col(P['ink-soft']); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of o.signed ? [-1, 0, 1] : [0, 0.5, 1]) {
    ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(W - R, y(v)); ctx.stroke();
    ctx.fillText(v.toString(), L - 6, y(v));
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  o.keys.forEach((k, m) => {
    const v = o.values[m], x = L + m * w, base = y(0);
    ctx.fillStyle = k === o.cue ? col(P.gold) : col(P.accent);
    const bw = Math.max(2, Math.min(28, w * 0.7));
    ctx.fillRect(x + (w - bw) / 2, Math.min(base, y(v)), bw, Math.max(1, Math.abs(y(v) - base)));
    ctx.fillStyle = col(P['ink-soft']);
    ctx.fillText(k, x + w / 2, H - B + 5);
  });
}

// ------------------------------------------------------------ the energy curve
// hist: [{ t, E }], the updates and the energy after them
export function drawEnergy(cv, hist, dense) {
  const { ctx, W, H, P } = fit(cv, 200);
  const L = 54, R = 12, T = 12, B = 30;
  const tMax = Math.max(dense ? 4 : 144, hist.at(-1).t);
  let lo = Math.min(...hist.map(h => h.E)), hi = Math.max(...hist.map(h => h.E));
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const X = t => L + t / tMax * (W - L - R), Y = e => T + (hi - e) / (hi - lo) * (H - T - B);
  ctx.strokeStyle = col(P['ink-soft']); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - R, H - B); ctx.stroke();
  ctx.font = `11px ${MONO}`; ctx.fillStyle = col(P['ink-soft']);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const e of [hi - pad, lo + pad]) { ctx.fillText(e.toFixed(1), L - 6, Y(e)); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('0', L, H - B + 5); ctx.fillText(String(tMax), W - R - 8, H - B + 5);
  ctx.fillText(tx('updates', 'aggiornamenti'), (L + W - R) / 2, H - B + 5);
  ctx.save(); ctx.translate(14, (T + H - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(tx('energy', 'energia'), 0, -6); ctx.restore();
  ctx.strokeStyle = col(P.accent); ctx.lineWidth = 2.5; ctx.beginPath();
  hist.forEach((h, k) => {
    if (!k) ctx.moveTo(X(h.t), Y(h.E));
    else if (dense) ctx.lineTo(X(h.t), Y(h.E));
    else { ctx.lineTo(X(h.t), Y(hist[k - 1].E)); ctx.lineTo(X(h.t), Y(h.E)); }
  });
  ctx.stroke();
  if (dense) for (const h of hist) { ctx.fillStyle = col(P.accent); ctx.beginPath(); ctx.arc(X(h.t), Y(h.E), 3.5, 0, 7); ctx.fill(); }
  const last = hist.at(-1);
  ctx.fillStyle = col(P.gold); ctx.beginPath(); ctx.arc(X(last.t), Y(last.E), 5, 0, 7); ctx.fill();
}

// ---------------------------------------------------------- the recall rates
// o = { N, pMax, classical: [{ p, cue, self }], dense: [{ p, r }] }
export function drawCapacity(cv, o) {
  const { ctx, W, H, P } = fit(cv, 290);
  const L = 48, R = 14, T = 34, B = 34, lx = Math.log(o.pMax);
  const X = p => L + Math.log(p) / lx * (W - L - R), Y = v => T + (1 - v) * (H - T - B);
  ctx.font = `11px ${MONO}`; ctx.lineWidth = 1;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of [0, 0.5, 1]) {
    ctx.strokeStyle = col(P.rule); ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(W - R, Y(v)); ctx.stroke();
    ctx.fillStyle = col(P['ink-soft']); ctx.fillText(`${100 * v}%`, L - 6, Y(v));
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const p of [1, 2, 5, 10, 20, 50, 100, 200]) if (p <= o.pMax) ctx.fillText(String(p), X(p), H - B + 5);
  ctx.fillText(tx('stored patterns p (log scale)', 'pattern memorizzati p (scala logaritmica)'), (L + W - R) / 2, H - B + 18);
  // the classical capacity 0.138 N and N
  ctx.setLineDash([4, 4]); ctx.strokeStyle = col(P['ink-soft']);
  for (const [p, s] of [[0.138 * o.N, '0.138 N'], [o.N, 'N']]) {
    ctx.beginPath(); ctx.moveTo(X(p), T - 4); ctx.lineTo(X(p), H - B); ctx.stroke();
    ctx.fillStyle = col(P['ink-soft']); ctx.textBaseline = 'bottom'; ctx.fillText(s, X(p), T - 6);
  }
  ctx.setLineDash([]);
  const curve = (pts, f, c, dash) => {
    if (!pts.length) return;
    ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.setLineDash(dash || []);
    ctx.beginPath(); pts.forEach((q, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, X(q.p), Y(f(q)))); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = c;
    for (const q of pts) { ctx.beginPath(); ctx.arc(X(q.p), Y(f(q)), 2.8, 0, 7); ctx.fill(); }
  };
  curve(o.classical, q => q.self, col(P['accent-2']), [5, 4]);
  curve(o.classical, q => q.cue, col(P.accent));
  curve(o.dense, q => q.r, col(P.gold));
  // the legend, in the top left corner
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `11px ${MONO}`;
  const items = [
    [col(P.accent), [], tx('classical, from a cue with 10% flipped', 'classica, da un indizio con il 10% invertito')],
    [col(P['accent-2']), [5, 4], tx('classical, from the pattern itself', 'classica, dal pattern stesso')],
    [col(P.gold), [], tx('dense, one update from the same cue', "densa, un aggiornamento dallo stesso indizio")],
  ];
  items.forEach(([c, d, s], k) => {
    const yy = Y(0.4) - 16 * (items.length - 1 - k) + 10, x = X(1) + 10;
    ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.setLineDash(d);
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 22, yy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col(P.ink); ctx.fillText(s, x + 28, yy);
  });
}
